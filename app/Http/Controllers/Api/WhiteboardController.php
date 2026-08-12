<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Whiteboard;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Str;

class WhiteboardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        // Default listing hides archived boards; `?include_archived=1` shows
        // ONLY archived boards so the dashboard's Archived view can list +
        // restore them without the active ones cluttering the view.
        $query = $request->boolean('include_archived')
            ? Whiteboard::archived()
            : Whiteboard::active();

        $sort = $request->query('sort', 'recent');
        if ($sort === 'alpha') {
            $query->orderBy('name', 'asc');
        } else {
            $query->orderBy('updated_at', 'desc');
        }

        if ($search = $request->query('search')) {
            // Escape LIKE wildcards so a literal `%` or `_` in the needle is
            // matched literally instead of acting as a wildcard. The explicit
            // ESCAPE clause keeps behavior consistent on SQLite (tests) and
            // MySQL (prod) — backslash is NOT an implicit escape on SQLite.
            $needle = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $search);
            $query->whereRaw("name LIKE ? ESCAPE '\\'", ['%'.$needle.'%']);
        }
        if ($request->has('project_id')) {
            $query->where('project_id', $request->project_id);
        }
        if ($request->has('created_by')) {
            $query->where('created_by', $request->created_by);
        }
        if ($request->has('limit')) {
            $query->limit((int) $request->limit);
        }

        return response()->json([
            'success' => true,
            'data' => $query->get(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string',
            'project_id' => 'nullable|string',
            'created_by' => 'required|string',
        ]);

        $whiteboard = Whiteboard::create([
            'name' => $validated['name'],
            'project_id' => $validated['project_id'] ?? null,
            'created_by' => $validated['created_by'],
            'user_id' => $request->user()?->id,
            'canvas_state' => ['version' => 1, 'elements' => []],
            'share_token' => Str::random(8),
        ]);

        return response()->json([
            'success' => true,
            'data' => $whiteboard,
        ], 201);
    }

    public function show(string $id): JsonResponse
    {
        $whiteboard = Whiteboard::find($id);

        if (!$whiteboard) {
            return response()->json([
                'success' => false,
                'error' => 'Whiteboard not found',
            ], 404);
        }

        // Don't leak the raw share_token to public viewers — it's a bearer
        // secret now that per-link shares exist.
        $data = $whiteboard->toArray();
        unset($data['share_token']);

        return response()->json([
            'success' => true,
            'data' => $data,
        ]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $whiteboard = Whiteboard::find($id);

        if (!$whiteboard) {
            return response()->json([
                'success' => false,
                'error' => 'Whiteboard not found',
            ], 404);
        }

        // Authorize: (a) authenticated board owner, or (b) a valid, unexpired
        // share link for this board (with edit role for canvas_state).
        $share = $this->resolveShare($request, $whiteboard);
        $user = $request->user();

        $isOwner = $user && $whiteboard->user_id
            && (string) $whiteboard->user_id === (string) $user->id;
        $isLegacyOwner = $user && !$whiteboard->user_id
            && ($user->isAdmin() || $whiteboard->created_by === $user->id);

        if (! $isOwner && ! $isLegacyOwner && ! $share) {
            return response()->json([
                'success' => false,
                'error' => 'You do not have permission to edit this whiteboard',
            ], 403);
        }

        // View-only shares can update canvas_state (they're editing the drawing)
        // but not the name or project.
        $validated = $request->validate([
            'name' => 'sometimes|string',
            'canvas_state' => 'sometimes|array',
            'project_id' => 'sometimes|nullable|string',
        ]);

        if ($share && $share->role === 'view') {
            unset($validated['name'], $validated['project_id']);
        }

        $whiteboard->update($validated);

        return response()->json([
            'success' => true,
            'data' => $whiteboard->fresh(),
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $whiteboard = Whiteboard::find($id);

        if (!$whiteboard) {
            return response()->json([
                'success' => false,
                'error' => 'Whiteboard not found',
            ], 404);
        }

        $user = $request->user();
        if ($user && $whiteboard->user_id) {
            if ((string) $whiteboard->user_id !== (string) $user->id) {
                return response()->json([
                    'success' => false,
                    'error' => 'You do not have permission to delete this whiteboard',
                ], 403);
            }
        }

        $whiteboard->delete();

        return response()->json([
            'success' => true,
        ]);
    }

    public function archive(Request $request, string $id): JsonResponse
    {
        return $this->setArchived($request, $id, true);
    }

    public function unarchive(Request $request, string $id): JsonResponse
    {
        return $this->setArchived($request, $id, false);
    }

    private function setArchived(Request $request, string $id, bool $archived): JsonResponse
    {
        $whiteboard = Whiteboard::find($id);

        if (!$whiteboard) {
            return response()->json([
                'success' => false,
                'error' => 'Whiteboard not found',
            ], 404);
        }

        if (! $this->ownsBoard($request, $whiteboard)) {
            return response()->json([
                'success' => false,
                'error' => 'You do not have permission to archive this whiteboard',
            ], 403);
        }

        $whiteboard->update([
            'archived_at' => $archived ? now() : null,
        ]);

        return response()->json([
            'success' => true,
            'data' => $whiteboard->fresh(),
        ]);
    }

    /**
     * Owner check for archive/unarchive — same rule as update/destroy/share:
     * the authenticated board owner, or the creator of a legacy guest board
     * (admin bypass).
     */
    private function ownsBoard(Request $request, Whiteboard $whiteboard): bool
    {
        $user = $request->user();
        if (! $user) {
            return false;
        }
        if ($whiteboard->user_id) {
            return (string) $whiteboard->user_id === (string) $user->id;
        }
        return $user->isAdmin() || (string) $whiteboard->created_by === (string) $user->id;
    }

    /**
     * Resolve a valid share credential for this whiteboard, if present.
     * Accepted via cookie (vp_share_token), header (X-Share-Token), or query (?share=).
     */
    private function resolveShare(Request $request, Whiteboard $whiteboard): ?\App\Models\WhiteboardShare
    {
        $token = $request->header('X-Share-Token')
            ?? $request->query('share')
            ?? $request->cookie('vp_share_token');

        if (! is_string($token) || $token === '') {
            return null;
        }

        $share = \App\Models\WhiteboardShare::findActiveByToken($token);

        return $share && $share->whiteboard_id === $whiteboard->id ? $share : null;
    }
}
