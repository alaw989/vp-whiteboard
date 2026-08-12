<?php

use App\Http\Controllers\Api\ApprovalController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return ['Laravel' => app()->version()];
});

// Owner-facing registration-approval confirmation page (rendered HTML).
// Public (the emailed link must resolve unauthenticated) and does a User
// lookup per request — light per-IP throttle (60/min, loopback-exempt).
Route::get('/approvals/{id}/{action}', [ApprovalController::class, 'show'])
    ->middleware('throttle:public-read')
    ->whereIn('action', ['approve', 'deny']);

require __DIR__.'/auth.php';
