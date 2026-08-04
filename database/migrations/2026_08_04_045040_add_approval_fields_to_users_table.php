<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // pending | approved | denied
            $table->string('status')->default('pending')->after('email');
            $table->timestamp('approved_at')->nullable()->after('status');
            $table->boolean('is_admin')->default(false)->after('approved_at');
        });

        // Existing users (owner + any test accounts) were never gated — approve them.
        DB::table('users')->update([
            'status' => 'approved',
            'approved_at' => now(),
        ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['status', 'approved_at', 'is_admin']);
        });
    }
};
