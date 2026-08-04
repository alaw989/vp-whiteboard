<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Whiteboard;
use App\Models\WhiteboardFile;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class FileUploadApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_unauthenticated_user_without_share_cannot_upload_file(): void
    {
        $whiteboard = Whiteboard::factory()->create();

        $response = $this->postJson('/api/files', [
            'whiteboard_id' => $whiteboard->id,
            'file' => UploadedFile::fake()->image('test.png'),
        ]);

        $response->assertForbidden();
    }

    public function test_authenticated_user_can_upload_file(): void
    {
        Storage::fake('public');
        $user = User::factory()->create();
        $whiteboard = Whiteboard::factory()->create(['user_id' => $user->id]);

        $response = $this->actingAs($user)->post('/api/files', [
            'whiteboard_id' => $whiteboard->id,
            'file' => UploadedFile::fake()->image('diagram.png', 200, 200),
        ]);

        $response->assertCreated()
            ->assertJson([
                'success' => true,
                'data' => [
                    'fileName' => 'diagram.png',
                ],
            ]);

        $this->assertDatabaseHas('whiteboard_files', [
            'whiteboard_id' => $whiteboard->id,
            'file_name' => 'diagram.png',
        ]);
    }

    public function test_upload_to_nonexistent_whiteboard_returns_404(): void
    {
        Storage::fake('public');
        $user = User::factory()->create();

        $response = $this->actingAs($user)->post('/api/files', [
            'whiteboard_id' => 'nonexistent-id',
            'file' => UploadedFile::fake()->image('orphan.png'),
        ]);

        $response->assertNotFound();
    }

    public function test_authenticated_user_can_list_files(): void
    {
        $user = User::factory()->create();
        $whiteboard = Whiteboard::factory()->create();
        WhiteboardFile::factory()->count(2)->create([
            'whiteboard_id' => $whiteboard->id,
        ]);

        $response = $this->actingAs($user)->getJson('/api/files?whiteboard_id=' . $whiteboard->id);

        $response->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_authenticated_user_can_delete_file(): void
    {
        Storage::fake('public');
        $user = User::factory()->create();
        $file = WhiteboardFile::factory()->create();

        $response = $this->actingAs($user)->deleteJson("/api/files/{$file->id}");

        $response->assertOk();
        $this->assertModelMissing($file);
    }

    public function test_html_file_upload_is_rejected(): void
    {
        Storage::fake('public');
        $user = User::factory()->create();
        $whiteboard = Whiteboard::factory()->create();

        $response = $this->actingAs($user)
            ->postJson('/api/files', [
                'whiteboard_id' => $whiteboard->id,
                'file' => UploadedFile::fake()->create('evil.html', 100, 'text/html'),
            ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('whiteboard_files', 0);
    }

    public function test_serve_never_returns_client_supplied_content_type(): void
    {
        Storage::fake('public');
        $whiteboard = Whiteboard::factory()->create();
        $file = WhiteboardFile::factory()->create([
            'whiteboard_id' => $whiteboard->id,
            'file_type' => 'text/html', // hostile value
            'storage_path' => 'uploads/evil.html',
        ]);

        Storage::disk('public')->put('uploads/evil.html', '<html><script>alert(1)</script></html>');

        $response = $this->get("/api/files/{$file->id}/serve");

        $response->assertOk();
        $this->assertEquals('application/octet-stream', $response->headers->get('Content-Type'));
        $this->assertEquals('nosniff', $response->headers->get('X-Content-Type-Options'));
    }
}
