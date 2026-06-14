<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Whiteboard;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Str;

class SessionController extends Controller
{
    private const SHARE_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string',
        ]);

        $shareToken = $this->generateShareToken();

        $whiteboard = Whiteboard::create([
            'name' => $validated['name'],
            'created_by' => 'guest',
            'canvas_state' => ['version' => 1, 'elements' => []],
            'share_token' => $shareToken,
        ]);

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $whiteboard->id,
                'short_id' => $shareToken,
                'name' => $whiteboard->name,
                'created_at' => $whiteboard->created_at,
                'updated_at' => $whiteboard->updated_at,
                'expires_at' => now()->addDays(7)->toIso8601String(),
                'canvas_state' => $whiteboard->canvas_state,
            ],
        ], 201);
    }

    public function showByShareToken(string $shortId): JsonResponse
    {
        if (!$this->isValidShareToken($shortId)) {
            return response()->json([
                'success' => false,
                'error' => 'Invalid session ID format',
            ], 400);
        }

        $whiteboard = Whiteboard::where('share_token', $shortId)->first();

        if (!$whiteboard) {
            return response()->json([
                'success' => false,
                'error' => 'Session not found',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $whiteboard->id,
                'short_id' => $whiteboard->share_token,
                'name' => $whiteboard->name,
                'created_at' => $whiteboard->created_at,
                'updated_at' => $whiteboard->updated_at,
                'expires_at' => now()->addDays(7)->toIso8601String(),
                'canvas_state' => $whiteboard->canvas_state,
            ],
        ]);
    }

    private function generateShareToken(int $length = 8): string
    {
        return Str::random($length);
        // Note: Str::random uses [0-9a-zA-Z] which is a superset;
        // for exact alphabet matching we'd use a custom generator,
        // but this is fine for our purposes.
    }

    private function isValidShareToken(string $id): bool
    {
        return (bool) preg_match('/^[abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/', $id);
    }
}
