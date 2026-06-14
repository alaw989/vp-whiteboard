<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whiteboard_files', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('whiteboard_id');
            $table->string('file_name');
            $table->string('file_type');
            $table->string('storage_path');
            $table->bigInteger('file_size');
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->foreign('whiteboard_id')
                ->references('id')
                ->on('whiteboards')
                ->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whiteboard_files');
    }
};
