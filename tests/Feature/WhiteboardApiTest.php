<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Whiteboard;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WhiteboardApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_user_cannot_list_whiteboards(): void
    {
        $response = $this->getJson('/api/whiteboards');

        $response->assertUnauthorized();
    }

    public function test_unauthenticated_user_cannot_create_whiteboard(): void
    {
        $response = $this->postJson('/api/whiteboards', [
            'name' => 'Test Board',
            'created_by' => 'Test User',
        ]);

        $response->assertUnauthorized();
    }

    public function test_authenticated_user_can_create_whiteboard(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/whiteboards', [
            'name' => 'My Board',
            'created_by' => 'Test User',
        ]);

        $response->assertCreated()
            ->assertJson([
                'success' => true,
                'data' => [
                    'name' => 'My Board',
                    'created_by' => 'Test User',
                ],
            ]);

        $this->assertDatabaseHas('whiteboards', [
            'name' => 'My Board',
        ]);
    }

    public function test_anyone_can_view_whiteboard_by_id(): void
    {
        $whiteboard = Whiteboard::factory()->create();

        $response = $this->getJson("/api/whiteboards/{$whiteboard->id}");

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'data' => [
                    'id' => $whiteboard->id,
                    'name' => $whiteboard->name,
                ],
            ]);
    }

    public function test_viewing_nonexistent_whiteboard_returns_404(): void
    {
        $response = $this->getJson('/api/whiteboards/nonexistent-id');

        $response->assertNotFound()
            ->assertJson([
                'success' => false,
                'error' => 'Whiteboard not found',
            ]);
    }

    public function test_unauthenticated_user_without_share_cannot_update_whiteboard(): void
    {
        $whiteboard = Whiteboard::factory()->create();

        $response = $this->patchJson("/api/whiteboards/{$whiteboard->id}", [
            'name' => 'Hacked Name',
        ]);

        $response->assertForbidden();
    }

    public function test_authenticated_user_can_update_whiteboard_name(): void
    {
        $user = User::factory()->create();
        $whiteboard = Whiteboard::factory()->create(['user_id' => $user->id]);

        $response = $this->actingAs($user)->patchJson("/api/whiteboards/{$whiteboard->id}", [
            'name' => 'Updated Name',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.name', 'Updated Name');
    }

    public function test_authenticated_user_can_update_canvas_state(): void
    {
        $user = User::factory()->create();
        $whiteboard = Whiteboard::factory()->create(['user_id' => $user->id]);
        $canvasState = ['version' => 2, 'elements' => [['id' => 'el1', 'type' => 'rectangle']]];

        $response = $this->actingAs($user)->patchJson("/api/whiteboards/{$whiteboard->id}", [
            'canvas_state' => $canvasState,
        ]);

        $response->assertOk();
        $this->assertEquals(
            $canvasState,
            $response->json('data.canvas_state'),
        );
    }

    public function test_unauthenticated_user_cannot_delete_whiteboard(): void
    {
        $whiteboard = Whiteboard::factory()->create();

        $response = $this->deleteJson("/api/whiteboards/{$whiteboard->id}");

        $response->assertUnauthorized();
    }

    public function test_authenticated_user_can_delete_whiteboard(): void
    {
        $user = User::factory()->create();
        $whiteboard = Whiteboard::factory()->create();

        $response = $this->actingAs($user)->deleteJson("/api/whiteboards/{$whiteboard->id}");

        $response->assertOk();
        $this->assertModelMissing($whiteboard);
    }

    public function test_authenticated_user_can_list_whiteboards(): void
    {
        $user = User::factory()->create();
        Whiteboard::factory()->count(2)->create();

        $response = $this->actingAs($user)->getJson('/api/whiteboards');

        $response->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_user_cannot_update_whiteboard_they_do_not_own(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $whiteboard = Whiteboard::factory()->create(['user_id' => $owner->id]);

        $response = $this->actingAs($intruder)->patchJson("/api/whiteboards/{$whiteboard->id}", [
            'name' => 'Hacked',
        ]);

        $response->assertForbidden();
        $this->assertDatabaseHas('whiteboards', ['id' => $whiteboard->id, 'name' => $whiteboard->name]);
    }

    public function test_user_cannot_delete_whiteboard_they_do_not_own(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $whiteboard = Whiteboard::factory()->create(['user_id' => $owner->id]);

        $response = $this->actingAs($intruder)->deleteJson("/api/whiteboards/{$whiteboard->id}");

        $response->assertForbidden();
        $this->assertDatabaseHas('whiteboards', ['id' => $whiteboard->id]);
    }

    public function test_owner_can_update_whiteboard(): void
    {
        $owner = User::factory()->create();
        $whiteboard = Whiteboard::factory()->create(['user_id' => $owner->id]);

        $response = $this->actingAs($owner)->patchJson("/api/whiteboards/{$whiteboard->id}", [
            'name' => 'Renamed',
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('whiteboards', ['id' => $whiteboard->id, 'name' => 'Renamed']);
    }

    public function test_owner_can_archive_whiteboard(): void
    {
        $owner = User::factory()->create();
        $whiteboard = Whiteboard::factory()->create(['user_id' => $owner->id]);

        $response = $this->actingAs($owner)->postJson("/api/whiteboards/{$whiteboard->id}/archive");

        $response->assertOk();
        $this->assertNotNull($response->json('data.archived_at'));
        $this->assertDatabaseHas('whiteboards', ['id' => $whiteboard->id]);
        $this->assertNotNull($whiteboard->fresh()->archived_at);
    }

    public function test_owner_can_unarchive_whiteboard(): void
    {
        $owner = User::factory()->create();
        $whiteboard = Whiteboard::factory()->create(['user_id' => $owner->id, 'archived_at' => now()]);

        $response = $this->actingAs($owner)->postJson("/api/whiteboards/{$whiteboard->id}/unarchive");

        $response->assertOk();
        $this->assertNull($response->json('data.archived_at'));
        $this->assertNull($whiteboard->fresh()->archived_at);
    }

    public function test_archive_unarchive_round_trip_restores_board(): void
    {
        $owner = User::factory()->create();
        $whiteboard = Whiteboard::factory()->create(['user_id' => $owner->id]);

        $this->actingAs($owner)->postJson("/api/whiteboards/{$whiteboard->id}/archive")->assertOk();
        $this->actingAs($owner)->postJson("/api/whiteboards/{$whiteboard->id}/unarchive")->assertOk();

        $this->assertNull($whiteboard->fresh()->archived_at);
    }

    public function test_archived_whiteboards_hidden_from_default_index(): void
    {
        $user = User::factory()->create();
        $active = Whiteboard::factory()->create(['user_id' => $user->id]);
        Whiteboard::factory()->create(['user_id' => $user->id, 'archived_at' => now()]);

        $response = $this->actingAs($user)->getJson('/api/whiteboards');

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $active->id);
    }

    public function test_unauthenticated_user_cannot_archive_whiteboard(): void
    {
        $whiteboard = Whiteboard::factory()->create();

        $this->postJson("/api/whiteboards/{$whiteboard->id}/archive")->assertUnauthorized();
        $this->assertNull($whiteboard->fresh()->archived_at);
    }

    public function test_non_owner_cannot_archive_whiteboard(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $whiteboard = Whiteboard::factory()->create(['user_id' => $owner->id]);

        $response = $this->actingAs($intruder)->postJson("/api/whiteboards/{$whiteboard->id}/archive");

        $response->assertForbidden();
        $this->assertNull($whiteboard->fresh()->archived_at);
    }

    public function test_non_owner_cannot_unarchive_whiteboard(): void
    {
        $owner = User::factory()->create();
        $intruder = User::factory()->create();
        $whiteboard = Whiteboard::factory()->create(['user_id' => $owner->id, 'archived_at' => now()]);

        $response = $this->actingAs($intruder)->postJson("/api/whiteboards/{$whiteboard->id}/unarchive");

        $response->assertForbidden();
        $this->assertNotNull($whiteboard->fresh()->archived_at);
    }

    public function test_legacy_creator_can_archive_guest_whiteboard(): void
    {
        $user = User::factory()->create();
        $whiteboard = Whiteboard::factory()->create([
            'user_id' => null,
            'created_by' => (string) $user->id,
        ]);

        $response = $this->actingAs($user)->postJson("/api/whiteboards/{$whiteboard->id}/archive");

        $response->assertOk();
        $this->assertNotNull($whiteboard->fresh()->archived_at);
    }

    public function test_archiving_nonexistent_whiteboard_returns_404(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/whiteboards/nonexistent-id/archive')->assertNotFound();
        $this->actingAs($user)->postJson('/api/whiteboards/nonexistent-id/unarchive')->assertNotFound();
    }

    public function test_index_search_filters_by_name(): void
    {
        $user = User::factory()->create();
        Whiteboard::factory()->create(['name' => 'Q4 Design Review']);
        Whiteboard::factory()->create(['name' => 'Site Layout']);

        $response = $this->actingAs($user)->getJson('/api/whiteboards?search=design');

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Q4 Design Review');
    }

    public function test_index_search_returns_empty_when_no_match(): void
    {
        $user = User::factory()->create();
        Whiteboard::factory()->create(['name' => 'Site Layout']);

        $response = $this->actingAs($user)->getJson('/api/whiteboards?search=nonexistent');

        $response->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_index_sort_recent_is_default_updated_at_desc(): void
    {
        $user = User::factory()->create();
        $old = Whiteboard::factory()->create(['name' => 'Alpha', 'updated_at' => now()->subDays(2)]);
        $new = Whiteboard::factory()->create(['name' => 'Beta', 'updated_at' => now()]);

        $response = $this->actingAs($user)->getJson('/api/whiteboards');

        $response->assertOk()
            ->assertJsonPath('data.0.id', $new->id)
            ->assertJsonPath('data.1.id', $old->id);
    }

    public function test_index_sort_alpha_orders_by_name_asc(): void
    {
        $user = User::factory()->create();
        Whiteboard::factory()->create(['name' => 'Zebra', 'updated_at' => now()]);
        Whiteboard::factory()->create(['name' => 'Alpha', 'updated_at' => now()->subDays(1)]);
        Whiteboard::factory()->create(['name' => 'Mango', 'updated_at' => now()->subDays(2)]);

        $response = $this->actingAs($user)->getJson('/api/whiteboards?sort=alpha');

        $response->assertOk()
            ->assertJsonPath('data.0.name', 'Alpha')
            ->assertJsonPath('data.1.name', 'Mango')
            ->assertJsonPath('data.2.name', 'Zebra');
    }

    public function test_index_unknown_sort_falls_back_to_recent(): void
    {
        $user = User::factory()->create();
        $old = Whiteboard::factory()->create(['name' => 'Alpha', 'updated_at' => now()->subDays(2)]);
        $new = Whiteboard::factory()->create(['name' => 'Beta', 'updated_at' => now()]);

        $response = $this->actingAs($user)->getJson('/api/whiteboards?sort=bogus');

        $response->assertOk()
            ->assertJsonPath('data.0.id', $new->id)
            ->assertJsonPath('data.1.id', $old->id);
    }

    public function test_index_search_excludes_archived_boards(): void
    {
        $user = User::factory()->create();
        Whiteboard::factory()->create(['name' => 'Archive Me', 'archived_at' => now()]);

        $response = $this->actingAs($user)->getJson('/api/whiteboards?search=archive');

        $response->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_index_include_archived_returns_only_archived_boards(): void
    {
        $user = User::factory()->create();
        Whiteboard::factory()->create(['user_id' => $user->id, 'updated_at' => now()]);
        $archived = Whiteboard::factory()->create(['user_id' => $user->id, 'archived_at' => now(), 'updated_at' => now()->subMinute()]);

        $response = $this->actingAs($user)->getJson('/api/whiteboards?include_archived=1');

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $archived->id);
    }

    public function test_index_include_archived_respects_search_and_sort(): void
    {
        $user = User::factory()->create();
        Whiteboard::factory()->create(['name' => 'Zeta Old', 'archived_at' => now(), 'updated_at' => now()->subDays(5)]);
        $archivedAlpha = Whiteboard::factory()->create(['name' => 'Alpha New', 'archived_at' => now(), 'updated_at' => now()]);

        $response = $this->actingAs($user)->getJson('/api/whiteboards?include_archived=1&sort=alpha&search=Alpha');

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $archivedAlpha->id);
    }
}
