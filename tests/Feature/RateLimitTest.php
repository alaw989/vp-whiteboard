<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Whiteboard;
use App\Models\WhiteboardShare;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Tests\TestCase;

class RateLimitTest extends TestCase
{
    use RefreshDatabase;

    private function withIp(string $ip): static
    {
        return $this->withServerVariables(['REMOTE_ADDR' => $ip]);
    }

    public function test_login_is_throttled_per_ip(): void
    {
        // Distinct IP so this bucket never touches other tests. Different emails
        // per attempt keep the app-level LoginRequest lockout (email|IP) out of
        // the picture — this asserts the HTTP middleware alone.
        $client = $this->withIp('203.0.113.10');

        for ($i = 0; $i < 5; $i++) {
            $response = $client->postJson('/login', [
                'email' => "throttle$i@example.com",
                'password' => 'wrong-password',
            ]);
            $this->assertNotEquals(429, $response->getStatusCode());
        }

        $response = $client->postJson('/login', [
            'email' => 'throttle6@example.com',
            'password' => 'wrong-password',
        ]);

        $response->assertStatus(429)
            ->assertJson(['message' => 'Too Many Attempts.']);
        $this->assertNotNull($response->headers->get('Retry-After'));
    }

    public function test_register_is_throttled_per_ip(): void
    {
        $client = $this->withIp('203.0.113.11');

        for ($i = 0; $i < 3; $i++) {
            $response = $client->postJson('/register', [
                'name' => 'Throttle User',
                'email' => "throttle-reg$i@example.com",
                'password' => 'password',
                'password_confirmation' => 'password',
            ]);
            $this->assertNotEquals(429, $response->getStatusCode());
        }

        $response = $client->postJson('/register', [
            'name' => 'Throttle User',
            'email' => 'throttle-reg3@example.com',
            'password' => 'password',
            'password_confirmation' => 'password',
        ]);

        $response->assertStatus(429)
            ->assertJson(['message' => 'Too Many Attempts.']);
    }

    public function test_forgot_password_is_throttled_per_ip(): void
    {
        $client = $this->withIp('203.0.113.13');

        for ($i = 0; $i < 5; $i++) {
            $response = $client->postJson('/forgot-password', [
                'email' => "throttle-fp$i@example.com",
            ]);
            $this->assertNotEquals(429, $response->getStatusCode());
        }

        $client->postJson('/forgot-password', [
            'email' => 'throttle-fp6@example.com',
        ])->assertStatus(429)
            ->assertJson(['message' => 'Too Many Attempts.']);
    }

    public function test_reset_password_is_throttled_per_ip(): void
    {
        $client = $this->withIp('203.0.113.14');

        for ($i = 0; $i < 5; $i++) {
            $response = $client->postJson('/reset-password', [
                'email' => "throttle-rp$i@example.com",
                'token' => 'bogus-token',
                'password' => 'new-password',
                'password_confirmation' => 'new-password',
            ]);
            $this->assertNotEquals(429, $response->getStatusCode());
        }

        $client->postJson('/reset-password', [
            'email' => 'throttle-rp6@example.com',
            'token' => 'bogus-token',
            'password' => 'new-password',
            'password_confirmation' => 'new-password',
        ])->assertStatus(429)
            ->assertJson(['message' => 'Too Many Attempts.']);
    }

    public function test_loopback_requests_are_not_throttled(): void
    {
        // Local/e2e/CI traffic originates from 127.0.0.1 (all Playwright workers
        // share the one loopback IP). Per-IP throttles must NOT apply to
        // loopback or the e2e suite's parallel logins would 429 each other —
        // this is the regression the loopback exemption guards against.
        // 6 logins (over the 5/min limit) must all stay non-429.
        $client = $this->withIp('127.0.0.1');

        for ($i = 0; $i < 6; $i++) {
            $response = $client->postJson('/login', [
                'email' => "loopback$i@example.com",
                'password' => 'wrong-password',
            ]);
            $this->assertNotEquals(429, $response->getStatusCode());
        }
    }

    public function test_file_upload_is_throttled_per_ip(): void
    {
        // POST /api/files is public (owner auth OR edit-role share token, no
        // auth middleware) and accepts up to 10MB per upload. 10/min/IP is the
        // new limit; a bogus whiteboard_id is fine because the throttle
        // middleware runs BEFORE the controller (404s still consume a hit).
        $client = $this->withIp('203.0.113.15');

        for ($i = 0; $i < 10; $i++) {
            $response = $client->postJson('/api/files', [
                'whiteboard_id' => 'nonexistent-id',
                'file' => UploadedFile::fake()->image("throttle-file-$i.png"),
            ]);
            $this->assertNotEquals(429, $response->getStatusCode());
        }

        $client->postJson('/api/files', [
            'whiteboard_id' => 'nonexistent-id',
            'file' => UploadedFile::fake()->image('throttle-file-over.png'),
        ])->assertStatus(429)
            ->assertJson(['message' => 'Too Many Attempts.']);
    }

    public function test_share_resolver_is_keyed_on_token_not_ip(): void
    {
        // The WS relay calls /api/shares/{token} from the droplet's own IP for
        // every share-link connection. If the limiter keyed on IP, all share
        // traffic would share one bucket and break WS sync. It must key on the
        // token, so hammering one token must NOT throttle a different token
        // from the same IP.
        $owner = User::factory()->create();
        $board = Whiteboard::factory()->create(['user_id' => $owner->id]);
        $resultA = WhiteboardShare::make($board->id, 'edit');
        $resultB = WhiteboardShare::make($board->id, 'view');

        $client = $this->withIp('198.51.100.25');

        for ($i = 0; $i < 60; $i++) {
            $response = $client->getJson('/api/shares/'.$resultA['token']);
            $this->assertNotEquals(429, $response->getStatusCode());
        }

        // Token A is now exhausted (60/min limit exceeded).
        $client->getJson('/api/shares/'.$resultA['token'])->assertStatus(429);

        // Token B from the SAME IP is unaffected — relay traffic survives.
        $response = $client->getJson('/api/shares/'.$resultB['token']);
        $response->assertOk()
            ->assertJsonPath('data.role', 'view');
    }

    public function test_public_read_is_throttled_per_ip(): void
    {
        $client = $this->withIp('203.0.113.12');

        for ($i = 0; $i < 60; $i++) {
            $response = $client->getJson('/api/whiteboards/nonexistent-id');
            $this->assertNotEquals(429, $response->getStatusCode());
        }

        $client->getJson('/api/whiteboards/nonexistent-id')
            ->assertStatus(429);
    }

    public function test_whiteboard_patch_is_throttled_per_ip(): void
    {
        // PATCH /api/whiteboards/{id} is the canvas auto-save route — public-ish
        // (owner auth OR edit-role share token, no auth middleware) and the last
        // public route without throttle. 60/min/IP is far above the ~12/min a
        // real auto-save loop emits. A bogus id is fine: the throttle middleware
        // runs BEFORE the controller (404s still consume a hit, no DB writes).
        $client = $this->withIp('203.0.113.16');

        for ($i = 0; $i < 60; $i++) {
            $response = $client->patchJson('/api/whiteboards/nonexistent-id', [
                'canvas_state' => '{"elements":[]}',
            ]);
            $this->assertNotEquals(429, $response->getStatusCode());
        }

        $client->patchJson('/api/whiteboards/nonexistent-id', [
            'canvas_state' => '{"elements":[]}',
        ])->assertStatus(429)
            ->assertJson(['message' => 'Too Many Attempts.']);
    }

    public function test_approval_confirmation_page_is_throttled_per_ip(): void
    {
        // GET /approvals/{id}/{action} (web.php) is the owner-facing blade page
        // the approval email links to — public (no auth, so the link resolves)
        // and does a User::findOrFail DB lookup per request. The throttle
        // middleware runs BEFORE the controller, so a bogus id still consumes a
        // hit (404 on the lookups, 429 once the 60/min public-read budget is
        // exhausted). NOTE: this is a web route, so the 429 body is the HTML
        // error page, not JSON — assert status + Retry-After header only.
        $client = $this->withIp('203.0.113.17');

        for ($i = 0; $i < 60; $i++) {
            $response = $client->get('/approvals/nonexistent-id/approve');
            $this->assertNotEquals(429, $response->getStatusCode());
        }

        $response = $client->get('/approvals/nonexistent-id/approve');
        $response->assertStatus(429);
        $this->assertNotNull($response->headers->get('Retry-After'));
    }
}
