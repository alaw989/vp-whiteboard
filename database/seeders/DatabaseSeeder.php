<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Seed real user accounts if SEED_USERS_JSON is configured.
        // This is a no-op when unset, keeping local/test/CI clean.
        $json = config('users.seed_json') ?: env('SEED_USERS_JSON');
        if ($json) {
            $this->call(UserSeeder::class);
        }
    }
}
