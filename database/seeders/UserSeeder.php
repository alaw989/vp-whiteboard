<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Seeds real user accounts for production / staging.
 *
 * Accounts are read from the SEED_USERS_JSON env var (a JSON array of
 * {name, email, password?} objects) so real emails/passwords never live in git.
 *
 *   SEED_USERS_JSON='[{"name":"Jane Engineer","email":"jane@vp-associates.com","password":"secret123"}]'
 *   php artisan db:seed --class=UserSeeder
 *
 * - Idempotent: existing users (matched by email) have only their name updated;
 *   their password is NEVER overwritten, so re-running won't lock anyone out.
 * - New users without an explicit password get a random 20-char one, printed once.
 * - Seeded accounts are marked email-verified.
 */
class UserSeeder extends Seeder
{
    public function run(): void
    {
        $accounts = $this->accounts();

        if (empty($accounts)) {
            $this->command->warn('UserSeeder: no accounts configured. Set SEED_USERS_JSON (JSON array of {name,email,password?}).');

            return;
        }

        $created = 0;
        $updated = 0;
        $generated = [];

        foreach ($accounts as $account) {
            $email = $account['email'] ?? null;
            $name = $account['name'] ?? 'Unnamed';
            if (! $email) {
                continue;
            }

            $user = User::where('email', $email)->first();

            if ($user) {
                // Exists: update name only — never clobber the password.
                $user->update(['name' => $name]);
                $updated++;
            } else {
                // Pass plaintext — the User model's `hashed` cast hashes it.
                $password = $account['password'] ?? Str::random(20);
                $user = User::create([
                    'name' => $name,
                    'email' => $email,
                    'password' => $password,
                    'email_verified_at' => now(),
                ]);
                $created++;
                if (! isset($account['password'])) {
                    $generated[$email] = $password;
                }
            }

            if (! $user->hasVerifiedEmail()) {
                $user->markEmailAsVerified();
            }
        }

        $this->command->info("UserSeeder: {$created} created, {$updated} updated.");

        if (! empty($generated)) {
            $this->command->warn('Generated passwords (share once, then delete from logs):');
            foreach ($generated as $email => $pw) {
                $this->command->line("  {$email} : {$pw}");
            }
        }
    }

    /**
     * @return array<int, array{name: string, email: string, password?: string}>
     */
    private function accounts(): array
    {
        $json = config('users.seed_json') ?: env('SEED_USERS_JSON');

        if (! $json) {
            return [];
        }

        $decoded = json_decode($json, true);

        return is_array($decoded) ? $decoded : [];
    }
}
