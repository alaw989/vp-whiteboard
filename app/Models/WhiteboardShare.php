<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class WhiteboardShare extends Model
{
    use HasFactory;

    protected $fillable = [
        'whiteboard_id',
        'token_hash',
        'role',
        'label',
        'expires_at',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
    ];

    public function whiteboard()
    {
        return $this->belongsTo(Whiteboard::class);
    }

    /**
     * Create a share with a fresh random token, storing only its hash.
     */
    public static function make(string $whiteboardId, string $role = 'edit', ?string $label = null, ?int $days = null): array
    {
        $rawToken = Str::random(40);

        $share = static::create([
            'whiteboard_id' => $whiteboardId,
            'token_hash' => hash('sha256', $rawToken),
            'role' => $role,
            'label' => $label,
            'expires_at' => $days ? now()->addDays($days) : null,
        ]);

        return ['share' => $share, 'token' => $rawToken];
    }

    /**
     * Find an active share by raw token (hash lookup, expiry-aware).
     */
    public static function findActiveByToken(string $rawToken): ?self
    {
        $share = static::where('token_hash', hash('sha256', $rawToken))->first();

        if (! $share) {
            return null;
        }

        if ($share->expires_at && $share->expires_at->isPast()) {
            return null;
        }

        return $share;
    }

    /**
     * The public-facing share link (raw token embedded — only ever shown to the
     * owner and the recipient; never stored in plaintext).
     */
    public static function urlFor(string $token): string
    {
        return url('/s/'.$token);
    }
}
