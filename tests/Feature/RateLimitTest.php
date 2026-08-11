<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Whiteboard;
use App\Models\WhiteboardShare;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
}
