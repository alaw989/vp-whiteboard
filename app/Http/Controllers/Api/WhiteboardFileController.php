<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Whiteboard;
use App\Models\WhiteboardFile;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class WhiteboardFileController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $request->validate(['whiteboard_id' => 'required|string']);

        $files = WhiteboardFile::where('whiteboard_id', $request->whiteboard_id)
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $files,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'max:10240', 'mimes:pdf,jpeg,jpg,png,webp'], // 10MB max (matches client)
            'whiteboard_id' => 'required|string',
        ]);

        $whiteboard = Whiteboard::find($request->whiteboard_id);
        if (!$whiteboard) {
            return response()->json([
                'success' => false,
                'error' => 'Whiteboard not found',
            ], 404);
        }

        // Authorize: owner OR a valid edit-role share for this board.
        $share = $this->resolveShare($request, $whiteboard);
        $user = $request->user();
        $isOwner = $user && $whiteboard->user_id && (string) $whiteboard->user_id === (string) $user->id;
        $isLegacyOwner = $user && !$whiteboard->user_id && ($user->isAdmin() || $whiteboard->created_by === $user->id);

        if (! $isOwner && ! $isLegacyOwner && ! ($share && $share->role === 'edit')) {
            return response()->json([
                'success' => false,
                'error' => 'You do not have permission to upload files',
            ], 403);
        }

        $file = $request->file('file');
        $fileName = $file->getClientOriginalName();
        $fileType = $file->getClientMimeType();
        $fileSize = $file->getSize();
        $storagePath = $file->store('uploads', 'public');

        $whiteboardFile = WhiteboardFile::create([
            'whiteboard_id' => $request->whiteboard_id,
            'file_name' => $fileName,
            'file_type' => $fileType,
            'storage_path' => $storagePath,
            'file_size' => $fileSize,
            'metadata' => [],
        ]);

        $serveUrl = url('/api/files/' . $whiteboardFile->id . '/serve');

        return response()->json([
            'success' => true,
            'data' => [
                'fileId' => $whiteboardFile->id,
                'fileName' => $fileName,
                'storagePath' => $storagePath,
                'url' => $serveUrl,
                'fileRecord' => $whiteboardFile,
            ],
        ], 201);
    }

    public function serve(string $id): \Symfony\Component\HttpFoundation\BinaryFileResponse
    {
        $file = WhiteboardFile::find($id);
        if (!$file || !$file->storage_path) {
            abort(404);
        }

        $path = Storage::disk('public')->path($file->storage_path);
        if (!file_exists($path)) {
            abort(404);
        }

        // Serve with the type recorded at upload (validated against an allowlist
        // on store), never the client-supplied value, plus nosniff so a browser
        // can't sniff a hostile file as HTML/script.
        $safeType = in_array($file->file_type, ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], true)
            ? $file->file_type
            : 'application/octet-stream';

        return response()->file($path, [
            'Access-Control-Allow-Origin' => env('FRONTEND_URL', 'http://localhost:3000'),
            'Access-Control-Allow-Credentials' => 'true',
            'Content-Type' => $safeType,
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    public function destroy(string $id): JsonResponse
    {
        $file = WhiteboardFile::find($id);

        if (!$file) {
            return response()->json([
                'success' => false,
                'error' => 'File not found',
            ], 404);
        }

        if ($file->storage_path) {
            Storage::disk('public')->delete($file->storage_path);
        }

        $file->delete();

        return response()->json([
            'success' => true,
        ]);
    }

    /**
     * Resolve a valid share credential for a whiteboard, if present.
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
