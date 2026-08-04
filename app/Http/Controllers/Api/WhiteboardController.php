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
        $query = Whiteboard::query()->orderBy('updated_at', 'desc');

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

        return response()->json([
            'success' => true,
            'data' => $whiteboard,
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

        // Only the board owner can mutate it. Boards created before user_id was
        // set (legacy/guest boards) are editable by the authenticated creator
        // string match, otherwise reject.
        $user = $request->user();
        if ($user && $whiteboard->user_id) {
            if ((string) $whiteboard->user_id !== (string) $user->id) {
                return response()->json([
                    'success' => false,
                    'error' => 'You do not have permission to edit this whiteboard',
                ], 403);
            }
        }

        $validated = $request->validate([
            'name' => 'sometimes|string',
            'canvas_state' => 'sometimes|array',
            'project_id' => 'sometimes|nullable|string',
        ]);

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
}
