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

        $response->assertNotFound();
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
