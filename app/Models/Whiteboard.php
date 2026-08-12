<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class Whiteboard extends Model
{
    use HasFactory, HasUuids;

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'user_id',
        'name',
        'project_id',
        'created_by',
        'share_token',
        'canvas_state',
        'archived_at',
    ];

    protected $casts = [
        'canvas_state' => 'array',
        'archived_at' => 'datetime',
    ];

    /**
     * Exclude archived whiteboards from the default listing.
     */
    public function scopeActive($query)
    {
        return $query->whereNull('archived_at');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function files()
    {
        return $this->hasMany(WhiteboardFile::class);
    }
}
