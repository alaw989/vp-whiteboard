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
}
