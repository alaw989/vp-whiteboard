<?php

return [
    /*
    |--------------------------------------------------------------------------
    | User Seed Accounts
    |--------------------------------------------------------------------------
    |
    | JSON array of user accounts to seed via db:seed. Each account should have
    | name, email, and an optional password. This source is never committed to git;
    | use the SEED_USERS_JSON env var (set on the droplet / CI) to provide real
    | credentials.
    |
    | Example: '[{"name":"Jane Engineer","email":"jane@example.com","password":"secret123"}]'
    |
    */
    'seed_json' => env('SEED_USERS_JSON'),
];
