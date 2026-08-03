<?php

namespace Database\Factories;

use App\Models\Whiteboard;
use Illuminate\Database\Eloquent\Factories\Factory;

class WhiteboardFactory extends Factory
{
    protected $model = Whiteboard::class;

    public function definition(): array
    {
        return [
            'name' => fake()->words(3, true),
            'created_by' => fake()->name(),
            'share_token' => fake()->regexify('[A-Za-z0-9]{8}'),
            'canvas_state' => ['version' => 1, 'elements' => []],
        ];
    }
}
