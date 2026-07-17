<?php

namespace Database\Factories;

use App\Models\Whiteboard;
use App\Models\WhiteboardFile;
use Illuminate\Database\Eloquent\Factories\Factory;

class WhiteboardFileFactory extends Factory
{
    protected $model = WhiteboardFile::class;

    public function definition(): array
    {
        return [
            'whiteboard_id' => Whiteboard::factory(),
            'file_name' => fake()->word() . '.png',
            'file_type' => 'image/png',
            'storage_path' => 'uploads/' . fake()->uuid() . '.png',
            'file_size' => fake()->numberBetween(1000, 50000),
            'metadata' => [],
        ];
    }
}
