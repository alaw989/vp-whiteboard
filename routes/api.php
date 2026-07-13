<?php

use App\Http\Controllers\Api\SessionController;
use App\Http\Controllers\Api\WhiteboardController;
use App\Http\Controllers\Api\WhiteboardFileController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Auth routes (from Breeze)
require __DIR__ . '/auth.php';

Route::middleware(['auth:sanctum'])->get('/user', function (Request $request) {
    return $request->user();
});

// Whiteboard CRUD (auth required for management)
Route::middleware(['auth:sanctum'])->prefix('whiteboards')->group(function () {
    Route::get('/', [WhiteboardController::class, 'index']);
    Route::post('/', [WhiteboardController::class, 'store']);
    Route::get('/{id}', [WhiteboardController::class, 'show']);
    Route::patch('/{id}', [WhiteboardController::class, 'update']);
    Route::put('/{id}', [WhiteboardController::class, 'update']);
    Route::delete('/{id}', [WhiteboardController::class, 'destroy']);
});

// File upload (auth required)
Route::middleware(['auth:sanctum'])->prefix('files')->group(function () {
    Route::get('/', [WhiteboardFileController::class, 'index']);
    Route::post('/', [WhiteboardFileController::class, 'store']);
    Route::delete('/{id}', [WhiteboardFileController::class, 'destroy']);
});

// Public file serving (CORS handled by middleware)
Route::get('/files/{id}/serve', [WhiteboardFileController::class, 'serve']);

// Session/share links (public — no auth required, uses share_token)
Route::prefix('sessions')->group(function () {
    Route::post('/', [SessionController::class, 'store']);
    Route::get('/{shortId}', [SessionController::class, 'showByShareToken']);
});
