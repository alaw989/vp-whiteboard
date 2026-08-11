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
        // Loopback (127.0.0.1/::1) is exempt: prod nginx forwards real client
        // IPs via REMOTE_ADDR ($remote_addr), so a loopback request is always
        // local tooling (dev, e2e suite, php artisan tinker) — never a remote
        // attacker. Without this, the e2e suite's parallel workers (all logging
        // in from 127.0.0.1) trip the 5/min limit and break every login test.
        RateLimiter::for('login', function (Request $request) {
            return $this->loopback($request, Limit::perMinute(5)->by($request->ip()));
        });

        // Also caps the per-registration owner-approval mail flood.
        RateLimiter::for('register', function (Request $request) {
            return $this->loopback($request, Limit::perMinute(3)->by($request->ip()));
        });

        RateLimiter::for('forgot-password', function (Request $request) {
            return $this->loopback($request, Limit::perMinute(5)->by($request->ip()));
        });

        RateLimiter::for('reset-password', function (Request $request) {
            return $this->loopback($request, Limit::perMinute(5)->by($request->ip()));
        });

        // Light per-IP cover for the remaining public reads. Generous so a share
        // viewer refreshing the board (re-fetching whiteboard + file serves +
        // sessions) is never tripped. Auto-save PATCH is NOT limited here.
        RateLimiter::for('public-read', function (Request $request) {
            return $this->loopback($request, Limit::perMinute(60)->by($request->ip()));
        });

        // POST /api/files is public (owner auth OR edit-role share token, no
        // auth middleware) and accepts up to 10MB per upload — without a limit
        // an edit-role share holder could fill the disk. 10/min/IP is far above
        // real usage (uploading a few overlays at once) while capping a flood.
        RateLimiter::for('file-upload', function (Request $request) {
            return $this->loopback($request, Limit::perMinute(10)->by($request->ip()));
        });
    }

    /**
     * Return an unlimited limiter for loopback requests, else the given limit.
     *
     * Local/dev/e2e/CI traffic always originates from 127.0.0.1 or ::1 and would
     * otherwise trip per-IP throttles (e.g. the e2e suite's parallel workers all
     * log in from the same loopback IP). Production is unaffected: nginx
     * forwards the real client IP via REMOTE_ADDR ($remote_addr), so a loopback
     * request in prod is server-local tooling, never a remote brute-force vector.
     */
    protected function loopback(Request $request, Limit $limit): Limit
    {
        return in_array($request->ip(), ['127.0.0.1', '::1'], true)
            ? Limit::none()
            : $limit;
    }
}
