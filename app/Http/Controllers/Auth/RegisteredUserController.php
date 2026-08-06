<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Mail\NewRegistrationRequest;
use App\Models\User;
use Illuminate\Auth\Events\Registered;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rules;
use Illuminate\Validation\ValidationException;

class RegisteredUserController extends Controller
{
    /**
     * Handle an incoming registration request.
     *
     * Creates the user in a 'pending' state and emails the owner for approval.
     * The user cannot log in until an owner approves them.
     *
     * @throws ValidationException
     */
    public function store(Request $request): \Illuminate\Http\JsonResponse
    {
        $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'lowercase', 'email', 'max:255', 'unique:'.User::class],
            'password' => ['required', 'confirmed', Rules\Password::defaults()],
        ]);

        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => Hash::make($request->string('password')),
            'status' => 'pending',
        ]);

        event(new Registered($user));

        $this->notifyOwner($user);

        // 201 with a "pending" marker so the frontend shows the approval screen
        // instead of navigating to the dashboard (no auto-login).
        return response()->json([
            'success' => true,
            'message' => 'pending',
            'data' => ['id' => $user->id],
        ], 201);
    }

    private function notifyOwner(User $user): void
    {
        $ownerEmails = array_values(array_filter(array_map(
            'trim',
            explode(',', (string) config('mail.admin_email'))
        )));
        if ($ownerEmails === []) {
            return;
        }

        $approveUrl = url('/approvals/'.$user->id.'/approve?'.http_build_query([
            'signature' => $this->signedPayload($user, 'approve'),
        ]));
        $denyUrl = url('/approvals/'.$user->id.'/deny?'.http_build_query([
            'signature' => $this->signedPayload($user, 'deny'),
        ]));

        try {
            Mail::to($ownerEmails)->send(new NewRegistrationRequest($user, $approveUrl, $denyUrl));
        } catch (\Throwable $e) {
            Log::warning('Failed to send registration-approval email: '.$e->getMessage());
        }
    }

    /**
     * Build a stateless signature proving the link was generated for this user
     * and action. (Kept simple — the confirmation page additionally requires an
     * authenticated owner to act, so the link is just the discovery mechanism.)
     */
    private function signedPayload(User $user, string $action): string
    {
        return hash_hmac('sha256', $user->id.'|'.$action.'|'.$user->email, (string) config('app.key'));
    }
}
