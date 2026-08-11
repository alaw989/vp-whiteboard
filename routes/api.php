<?php

use App\Http\Controllers\Api\ApprovalController;
use App\Http\Controllers\Api\SessionController;
use App\Http\Controllers\Api\ShareController;
use App\Http\Controllers\Api\WhiteboardController;
use App\Http\Controllers\Api\WhiteboardFileController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Auth routes (from Breeze)
require __DIR__ . '/auth.php';

Route::middleware(['auth:sanctum'])->get('/user', function (Request $request) {
    return $request->user();
});

// Registration-approval actions (owner-only; the confirmation page is in web.php)
Route::middleware(['auth:sanctum'])->prefix('approvals')->group(function () {
    Route::get('/', [ApprovalController::class, 'pending']);
    Route::post('/{id}/approve', [ApprovalController::class, 'approve']);
    Route::post('/{id}/deny', [ApprovalController::class, 'deny']);
});

// Whiteboard CRUD (show + canvas-state PATCH are public-ish: owner auth OR a
// valid share token; other mutations require auth)
Route::get('/whiteboards/{id}', [WhiteboardController::class, 'show'])
    ->middleware('throttle:public-read');
Route::patch('/whiteboards/{id}', [WhiteboardController::class, 'update']);
Route::put('/whiteboards/{id}', [WhiteboardController::class, 'update']);
Route::middleware(['auth:sanctum'])->prefix('whiteboards')->group(function () {
    Route::get('/', [WhiteboardController::class, 'index']);
    Route::post('/', [WhiteboardController::class, 'store']);
    Route::delete('/{id}', [WhiteboardController::class, 'destroy']);
});

// File upload (owner or edit-role share; index/delete require auth)
Route::post('/files', [WhiteboardFileController::class, 'store']);
Route::middleware(['auth:sanctum'])->prefix('files')->group(function () {
    Route::get('/', [WhiteboardFileController::class, 'index']);
    Route::delete('/{id}', [WhiteboardFileController::class, 'destroy']);
});

// Public file serving (CORS handled by middleware)
Route::get('/files/{id}/serve', [WhiteboardFileController::class, 'serve'])
    ->middleware('throttle:public-read');

// Share links (owner manages shares; public token resolver)
Route::middleware(['auth:sanctum'])->prefix('whiteboards')->group(function () {
    Route::get('/{id}/shares', [ShareController::class, 'index']);
    Route::post('/{id}/shares', [ShareController::class, 'store']);
    Route::delete('/{id}/shares/{shareId}', [ShareController::class, 'destroy']);
});
Route::get('/shares/{token}', [ShareController::class, 'resolve'])
    ->middleware('throttle:shares');

// Session/share links (public — no auth required, uses share_token)
Route::prefix('sessions')->middleware('throttle:public-read')->group(function () {
    Route::post('/', [SessionController::class, 'store']);
    Route::get('/{shortId}', [SessionController::class, 'showByShareToken']);
});
