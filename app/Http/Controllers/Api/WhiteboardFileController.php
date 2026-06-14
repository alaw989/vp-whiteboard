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
            'file' => 'required|file|max:51200', // 50MB max
            'whiteboard_id' => 'required|string',
        ]);

        $whiteboard = Whiteboard::find($request->whiteboard_id);
        if (!$whiteboard) {
            return response()->json([
                'success' => false,
                'error' => 'Whiteboard not found',
            ], 404);
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

        $url = Storage::disk('public')->url($storagePath);

        return response()->json([
            'success' => true,
            'data' => [
                'fileId' => $whiteboardFile->id,
                'fileName' => $fileName,
                'storagePath' => $storagePath,
                'url' => $url,
                'fileRecord' => $whiteboardFile,
            ],
        ], 201);
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
}
