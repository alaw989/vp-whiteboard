<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class ApprovalController extends Controller
{
    /**
     * Render the owner-facing approve/deny confirmation page.
     * The page itself is public so the email link resolves; the actual action
     * below requires an authenticated owner (the page prompts a login).
     */
    public function show(string $id, string $action, Request $request): \Illuminate\View\View
    {
        $user = User::findOrFail($id);
        $validSignature = $this->validSignature($request, $user, $action);

        return view('approvals.confirm', [
            'user' => $user,
            'action' => $action,
            'validSignature' => $validSignature,
        ]);
    }

    /**
     * Approve a pending user. Owner-only, POST.
     */
    public function approve(Request $request, string $id): JsonResponse
    {
        if (! $request->user()?->isAdmin()) {
            return response()->json(['success' => false, 'error' => 'Unauthorized'], 403);
        }

        $user = User::findOrFail($id);
        $user->update(['status' => 'approved', 'approved_at' => now()]);

        return response()->json(['success' => true, 'data' => $user]);
    }

    /**
     * Deny a pending user. Owner-only, POST. Pending users are hard-deleted
     * (nothing to preserve, frees the email for a future legitimate request).
     */
    public function deny(Request $request, string $id): JsonResponse
    {
        if (! $request->user()?->isAdmin()) {
            return response()->json(['success' => false, 'error' => 'Unauthorized'], 403);
        }

        $user = User::findOrFail($id);
        $user->delete();

        return response()->json(['success' => true]);
    }

    /**
     * List pending registration requests (owner-only, optional admin panel).
     */
    public function pending(Request $request): JsonResponse
    {
        if (! $request->user()?->isAdmin()) {
            return response()->json(['success' => false, 'error' => 'Unauthorized'], 403);
        }

        $pending = User::where('status', 'pending')->orderBy('created_at', 'desc')->get();

        return response()->json(['success' => true, 'data' => $pending]);
    }

    private function validSignature(Request $request, User $user, string $action): bool
    {
        $expected = $request->input('signature');
        $computed = hash_hmac('sha256', $user->id.'|'.$action.'|'.$user->email, (string) config('app.key'));

        return is_string($expected) && hash_equals($computed, $expected);
    }
}
