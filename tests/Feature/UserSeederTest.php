<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserSeederTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Clear the config/env before each test
        config(['users.seed_json' => null]);
        putenv('SEED_USERS_JSON');
    }

    public function test_creates_two_users_from_json_both_email_verified(): void
    {
        $json = json_encode([
            ['name' => 'Alice Engineer', 'email' => 'alice@example.com', 'password' => 'secret123'],
            ['name' => 'Bob Engineer', 'email' => 'bob@example.com', 'password' => 'password456'],
        ]);

        config(['users.seed_json' => $json]);

        $this->seed(\Database\Seeders\UserSeeder::class);

        $this->assertDatabaseCount('users', 2);

        $alice = User::where('email', 'alice@example.com')->first();
        $this->assertNotNull($alice);
        $this->assertEquals('Alice Engineer', $alice->name);
        $this->assertTrue($alice->hasVerifiedEmail());

        $bob = User::where('email', 'bob@example.com')->first();
        $this->assertNotNull($bob);
        $this->assertEquals('Bob Engineer', $bob->name);
        $this->assertTrue($bob->hasVerifiedEmail());
    }

    public function test_re_running_seeder_is_idempotent_no_duplicates_and_password_unchanged(): void
    {
        $json = json_encode([
            ['name' => 'Charlie Engineer', 'email' => 'charlie@example.com', 'password' => 'original123'],
        ]);

        config(['users.seed_json' => $json]);

        // First run
        $this->seed(\Database\Seeders\UserSeeder::class);
        $user = User::where('email', 'charlie@example.com')->first();
        $originalHash = $user->password;

        $this->assertDatabaseCount('users', 1);

        // Second run (should not create a duplicate, and password should not change)
        $this->seed(\Database\Seeders\UserSeeder::class);

        $this->assertDatabaseCount('users', 1);

        $user->refresh();
        $this->assertEquals($originalHash, $user->password);
    }

    public function test_when_seed_json_is_unset_seeder_is_a_no_op(): void
    {
        // Ensure SEED_USERS_JSON is unset
        config(['users.seed_json' => null]);
        putenv('SEED_USERS_JSON');

        $this->seed(\Database\Seeders\UserSeeder::class);

        $this->assertDatabaseCount('users', 0);
    }

    public function test_when_seed_json_is_empty_string_seeder_is_a_no_op(): void
    {
        config(['users.seed_json' => '']);

        $this->seed(\Database\Seeders\UserSeeder::class);

        $this->assertDatabaseCount('users', 0);
    }

    public function test_generates_random_password_when_not_provided(): void
    {
        $json = json_encode([
            ['name' => 'Dave Engineer', 'email' => 'dave@example.com'],
        ]);

        config(['users.seed_json' => $json]);

        $this->seed(\Database\Seeders\UserSeeder::class);

        $dave = User::where('email', 'dave@example.com')->first();

        $this->assertNotNull($dave);
        $this->assertNotNull($dave->password);
        $this->assertNotEmpty($dave->password);
    }

    public function test_updates_name_only_for_existing_users_never_password(): void
    {
        $json = json_encode([
            ['name' => 'Eve Engineer', 'email' => 'eve@example.com', 'password' => 'eve123'],
        ]);

        config(['users.seed_json' => $json]);

        // First run
        $this->seed(\Database\Seeders\UserSeeder::class);
        $user = User::where('email', 'eve@example.com')->first();
        $originalHash = $user->password;

        // Update the name in the JSON and re-run
        $jsonUpdated = json_encode([
            ['name' => 'Eve Updated', 'email' => 'eve@example.com', 'password' => 'newpass456'],
        ]);

        config(['users.seed_json' => $jsonUpdated]);
        $this->seed(\Database\Seeders\UserSeeder::class);

        $user->refresh();

        // Name should be updated
        $this->assertEquals('Eve Updated', $user->name);
        // Password should NOT be changed (the 'newpass456' is ignored)
        $this->assertEquals($originalHash, $user->password);
    }
}
