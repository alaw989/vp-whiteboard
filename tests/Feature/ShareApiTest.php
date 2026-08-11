<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Whiteboard;
use App\Models\WhiteboardShare;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class ShareApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_create_share_link(): void
    {
        $owner = User::factory()->create();
        $board = Whiteboard::factory()->create(['user_id' => $owner->id]);

        $response = $this->actingAs($owner)->postJson("/api/whiteboards/{$board->id}/shares", [
            'role' => 'edit',
            'label' => 'ACME — Tower 2',
            'days' => 7,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.role', 'edit');
        $this->assertDatabaseCount('whiteboard_shares', 1);
        $this->assertStringContainsString('/s/', $response->json('data.url'));
    }

    public function test_non_owner_cannot_create_share(): void
    {
        $intruder = User::factory()->create();
        $board = Whiteboard::factory()->create(['user_id' => User::factory()->create()->id]);

        $response = $this->actingAs($intruder)->postJson("/api/whiteboards/{$board->id}/shares");

        $response->assertForbidden();
        $this->assertDatabaseCount('whiteboard_shares', 0);
    }

    public function test_public_resolver_returns_board_for_valid_token(): void
    {
        $owner = User::factory()->create();
        $board = Whiteboard::factory()->create(['user_id' => $owner->id]);
        $result = WhiteboardShare::make($board->id, 'edit');

        $response = $this->getJson('/api/shares/'.$result['token']);

        $response->assertOk()
            ->assertJsonPath('data.whiteboard_id', $board->id)
            ->assertJsonPath('data.role', 'edit');
    }

    public function test_expired_share_is_rejected(): void
    {
        $owner = User::factory()->create();
        $board = Whiteboard::factory()->create(['user_id' => $owner->id]);
        $rawToken = Str::random(40);
        WhiteboardShare::create([
            'whiteboard_id' => $board->id,
            'token_hash' => hash('sha256', $rawToken),
            'role' => 'edit',
            'expires_at' => now()->subDay(),
        ]);

        $response = $this->getJson('/api/shares/'.$rawToken);

        $response->assertGone()
            ->assertJsonPath('success', false)
            ->assertJsonPath('error', 'expired');
    }

    public function test_unknown_or_revoked_token_is_not_found(): void
    {
        $rawToken = Str::random(40);

        $response = $this->getJson('/api/shares/'.$rawToken);

        $response->assertNotFound()
            ->assertJsonPath('success', false)
            ->assertJsonPath('error', 'not_found');
    }

    public function test_share_token_allows_anonymous_autosave(): void
    {
        $owner = User::factory()->create();
        $board = Whiteboard::factory()->create(['user_id' => $owner->id]);
        $result = WhiteboardShare::make($board->id, 'edit');

        $response = $this->patchJson("/api/whiteboards/{$board->id}", [
            'canvas_state' => ['version' => 2, 'elements' => [['id' => 'el1']]],
        ], ['X-Share-Token' => $result['token']]);

        $response->assertOk();
        $this->assertDatabaseHas('whiteboards', ['id' => $board->id]);
        $this->assertEquals(2, $board->fresh()->canvas_state['version']);
    }

    public function test_share_cookie_survives_stateful_encrypted_request(): void
    {
        $owner = User::factory()->create();
        $board = Whiteboard::factory()->create(['user_id' => $owner->id]);
        $result = WhiteboardShare::make($board->id, 'edit');

        // A real browser sends Origin/Referer, which makes Sanctum treat the
        // request as "stateful" and pipe it through EncryptCookies. The
        // vp_share_token cookie is set by Nitro (not Laravel-encrypted), so
        // EncryptCookies used to null it out, breaking share-link autosave
        // with a 403. It must survive.
        $response = $this
            ->withCredentials()
            ->withServerVariables([
                'HTTP_ORIGIN' => 'http://localhost',
                'HTTP_REFERER' => 'http://localhost/',
            ])
            ->withUnencryptedCookie('vp_share_token', $result['token'])
            ->patchJson("/api/whiteboards/{$board->id}", [
                'canvas_state' => ['version' => 3, 'elements' => [['id' => 'el1']]],
            ]);

        $response->assertOk();
        $this->assertEquals(3, $board->fresh()->canvas_state['version']);
    }

    public function test_view_role_share_cannot_change_name(): void
    {
        $owner = User::factory()->create();
        $board = Whiteboard::factory()->create(['user_id' => $owner->id, 'name' => 'Original']);
        $result = WhiteboardShare::make($board->id, 'view');

        $response = $this->patchJson("/api/whiteboards/{$board->id}", [
            'name' => 'Should Not Persist',
        ], ['X-Share-Token' => $result['token']]);

        $response->assertOk();
        $this->assertDatabaseHas('whiteboards', ['id' => $board->id, 'name' => 'Original']);
    }

    public function test_owner_can_revoke_share(): void
    {
        $owner = User::factory()->create();
        $board = Whiteboard::factory()->create(['user_id' => $owner->id]);
        $result = WhiteboardShare::make($board->id, 'edit');

        $response = $this->actingAs($owner)->deleteJson(
            "/api/whiteboards/{$board->id}/shares/{$result['share']->id}"
        );

        $response->assertOk();
        $this->assertDatabaseMissing('whiteboard_shares', ['id' => $result['share']->id]);
    }
}
