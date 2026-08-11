<?php

namespace App\Providers;

use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        ResetPassword::createUrlUsing(function (object $notifiable, string $token) {
            return config('app.frontend_url')."/password-reset/$token?email={$notifiable->getEmailForPasswordReset()}";
        });

        // Public share-token resolver — hit by the Nitro /s/{token} page AND the
        // WS relay (frontend/server/ws-server.js) from the droplet's own IP for
        // EVERY share-link WebSocket connection. Keying on IP would merge the
        // whole app's share traffic into one bucket and 429 the relay, breaking
        // WS sync — so key on the TOKEN itself. Generous 60/min per token; the
        // relay caches verdicts 60s so it never approaches this.
        RateLimiter::for('shares', fn (Request $request) => Limit::perMinute(60)
            ->by((string) $request->route('token')));

        // Brute-force defense-in-depth on auth endpoints (the app-level lockout
        // in LoginRequest remains the first gate; different keys, no conflict).
        RateLimiter::for('login', fn (Request $request) => Limit::perMinute(5)
            ->by($request->ip()));

        // Also caps the per-registration owner-approval mail flood.
        RateLimiter::for('register', fn (Request $request) => Limit::perMinute(3)
            ->by($request->ip()));

        RateLimiter::for('forgot-password', fn (Request $request) => Limit::perMinute(5)
            ->by($request->ip()));

        RateLimiter::for('reset-password', fn (Request $request) => Limit::perMinute(5)
            ->by($request->ip()));

        // Light per-IP cover for the remaining public reads. Generous so a share
        // viewer refreshing the board (re-fetching whiteboard + file serves +
        // sessions) is never tripped. Auto-save PATCH is NOT limited here.
        RateLimiter::for('public-read', fn (Request $request) => Limit::perMinute(60)
            ->by($request->ip()));
    }
}
