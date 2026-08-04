<?php

namespace Database\Factories;

use App\Models\WhiteboardShare;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<WhiteboardShare>
 */
class WhiteboardShareFactory extends Factory
{
    protected $model = WhiteboardShare::class;

    public function definition(): array
    {
        return [
            'whiteboard_id' => \App\Models\Whiteboard::factory(),
            'token_hash' => hash('sha256', Str::random(40)),
            'role' => 'edit',
            'label' => null,
            'expires_at' => null,
        ];
    }
}
