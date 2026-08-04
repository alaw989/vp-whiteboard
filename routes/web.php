<?php

use App\Http\Controllers\Api\ApprovalController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return ['Laravel' => app()->version()];
});

// Owner-facing registration-approval confirmation page (rendered HTML).
Route::get('/approvals/{id}/{action}', [ApprovalController::class, 'show'])
    ->whereIn('action', ['approve', 'deny']);

require __DIR__.'/auth.php';
