<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Whiteboard;
use App\Models\WhiteboardShare;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class ShareController extends Controller
{
    /**
     * List active shares for a whiteboard (owner-only).
     */
    public function index(Request $request, string $whiteboardId): JsonResponse
    {
        $whiteboard = Whiteboard::findOrFail($whiteboardId);
        if (! $this->ownsBoard($request, $whiteboard)) {
            return response()->json(['success' => false, 'error' => 'Unauthorized'], 403);
        }

        $shares = WhiteboardShare::where('whiteboard_id', $whiteboardId)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json(['success' => true, 'data' => $shares]);
    }

    /**
     * Create a share link (owner-only). Returns the raw token exactly once.
     */
    public function store(Request $request, string $whiteboardId): JsonResponse
    {
        $whiteboard = Whiteboard::findOrFail($whiteboardId);
        if (! $this->ownsBoard($request, $whiteboard)) {
            return response()->json(['success' => false, 'error' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'role' => 'sometimes|in:view,edit',
            'label' => 'sometimes|nullable|string|max:255',
            'days' => 'sometimes|nullable|integer|min:1|max:365',
        ]);

        $result = WhiteboardShare::make(
            $whiteboardId,
            $validated['role'] ?? 'edit',
            $validated['label'] ?? null,
            $validated['days'] ?? null,
        );

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $result['share']->id,
                'role' => $result['share']->role,
                'label' => $result['share']->label,
                'expires_at' => $result['share']->expires_at?->toIso8601String(),
                'url' => WhiteboardShare::urlFor($result['token']),
            ],
        ], 201);
    }

    /**
     * Revoke a share link (owner-only).
     */
    public function destroy(Request $request, string $whiteboardId, string $shareId): JsonResponse
    {
        $whiteboard = Whiteboard::findOrFail($whiteboardId);
        if (! $this->ownsBoard($request, $whiteboard)) {
            return response()->json(['success' => false, 'error' => 'Unauthorized'], 403);
        }

        $share = WhiteboardShare::where('whiteboard_id', $whiteboardId)
            ->where('id', $shareId)
            ->firstOrFail();
        $share->delete();

        return response()->json(['success' => true]);
    }

    /**
     * Public resolver for a raw share token — used by the Nitro /s/{token}
     * redirect and the WS relay. Returns the target board + role, expiry-aware.
     */
    public function resolve(string $token): JsonResponse
    {
        $share = WhiteboardShare::findActiveByToken($token);

        if (! $share) {
            return response()->json(['success' => false, 'error' => 'Share not found or expired'], 404);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'whiteboard_id' => $share->whiteboard_id,
                'role' => $share->role,
                'expires_at' => $share->expires_at?->toIso8601String(),
            ],
        ]);
    }

    private function ownsBoard(Request $request, Whiteboard $whiteboard): bool
    {
        $user = $request->user();
        if (! $user) {
            return false;
        }
        if ($whiteboard->user_id) {
            return (string) $whiteboard->user_id === (string) $user->id;
        }
        // Legacy guest boards: any authenticated user who created them via
        // created_by string match, else owner/admin.
        return $user->isAdmin() || $whiteboard->created_by === $user->id;
    }
}
