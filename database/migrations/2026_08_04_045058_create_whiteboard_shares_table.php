<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('whiteboard_shares', function (Blueprint $table) {
            $table->id();
            $table->uuid('whiteboard_id');
            $table->foreign('whiteboard_id')->references('id')->on('whiteboards')->cascadeOnDelete();
            $table->string('token_hash', 64)->unique();      // sha256 of the raw token
            $table->string('role', 16)->default('edit');      // view | edit
            $table->string('label')->nullable();              // e.g. "ACME — Tower 2"
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('whiteboard_shares');
    }
};
