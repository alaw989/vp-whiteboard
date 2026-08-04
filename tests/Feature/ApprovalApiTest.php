<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApprovalApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_pending_user_cannot_log_in(): void
    {
        $user = User::factory()->pending()->create();

        // Web login redirects back with a validation error (pending message).
        $response = $this->post('/login', [
            'email' => $user->email,
            'password' => 'password',
        ]);

        $response->assertStatus(302);
        $this->assertGuest();
        $this->assertTrue($response->getSession()->has('errors'));
    }

    public function test_admin_can_approve_pending_user(): void
    {
        $admin = User::factory()->admin()->create();
        $pending = User::factory()->pending()->create();

        $response = $this->actingAs($admin)->postJson("/api/approvals/{$pending->id}/approve");

        $response->assertOk();
        $this->assertDatabaseHas('users', [
            'id' => $pending->id,
            'status' => 'approved',
        ]);
        $this->assertNotNull($pending->fresh()->approved_at);
    }

    public function test_non_admin_cannot_approve(): void
    {
        $regular = User::factory()->create();
        $pending = User::factory()->pending()->create();

        $response = $this->actingAs($regular)->postJson("/api/approvals/{$pending->id}/approve");

        $response->assertForbidden();
        $this->assertDatabaseHas('users', ['id' => $pending->id, 'status' => 'pending']);
    }

    public function test_admin_can_deny_pending_user(): void
    {
        $admin = User::factory()->admin()->create();
        $pending = User::factory()->pending()->create();

        $response = $this->actingAs($admin)->postJson("/api/approvals/{$pending->id}/deny");

        $response->assertOk();
        $this->assertDatabaseMissing('users', ['id' => $pending->id]);
    }

    public function test_admin_can_list_pending_requests(): void
    {
        $admin = User::factory()->admin()->create();
        User::factory()->pending()->count(2)->create();

        $response = $this->actingAs($admin)->getJson('/api/approvals');

        $response->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_approved_user_can_log_in(): void
    {
        $user = User::factory()->create();

        $response = $this->post('/login', [
            'email' => $user->email,
            'password' => 'password',
        ]);

        $response->assertNoContent();
        $this->assertAuthenticated();
    }
}
