<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Access request — {{ $user->name }}</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #f3f4f6; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
        .card { background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,.08); max-width: 420px; width: 100%; padding: 32px; }
        h1 { font-size: 20px; margin: 0 0 8px; }
        p { color: #4b5563; margin: 8px 0; }
        .meta { color: #6b7280; font-size: 14px; }
        .row { display: flex; gap: 12px; margin-top: 24px; }
        .btn { flex: 1; padding: 12px; border: 0; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; color: #fff; }
        .btn-approve { background: #16a34a; }
        .btn-deny { background: #dc2626; }
        .btn-approve:disabled, .btn-deny:disabled { opacity: .4; cursor: not-allowed; }
        .notice { background: #fef3c7; color: #92400e; padding: 12px; border-radius: 8px; font-size: 14px; margin-top: 16px; }
        #result { margin-top: 16px; font-size: 14px; }
    </style>
</head>
<body>
    <div class="card">
        <h1>Access request</h1>
        <p><strong>{{ $user->name }}</strong></p>
        <p class="meta">{{ $user->email }}</p>

        @if (!$validSignature)
            <div class="notice">This link is invalid or expired.</div>
        @elseif ($user->status === 'approved')
            <p>This request has already been approved.</p>
        @elseif ($user->status === 'denied')
            <p>This request has already been denied.</p>
        @else
            <p class="meta">Requested {{ $user->created_at->diffForHumans() }}.</p>
            <p>Sign in as an owner to complete this action.</p>

            <div class="row">
                <button class="btn btn-approve" id="approve" disabled>Approve</button>
                <button class="btn btn-deny" id="deny" disabled>Deny</button>
            </div>
            <div id="result"></div>
            <script>
                // Attempt the action; a 403 prompts the owner to sign in, then retry.
                const userId = {{ $user->id }};
                async function act(action) {
                    const btn = document.getElementById(action);
                    btn.disabled = true;
                    const res = await fetch('/api/approvals/' + userId + '/' + action, {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                    });
                    if (res.ok) {
                        document.getElementById('result').textContent =
                            action === 'approve' ? 'User approved. They can now log in.' : 'Request denied.';
                        document.getElementById('approve').disabled = true;
                        document.getElementById('deny').disabled = true;
                    } else if (res.status === 403) {
                        document.getElementById('result').textContent =
                            'Please sign in as the owner, then click the action again.';
                        btn.disabled = false;
                        window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
                    } else {
                        const data = await res.json().catch(() => ({}));
                        document.getElementById('result').textContent = data.error || 'Something went wrong.';
                        btn.disabled = false;
                    }
                }
                // Enable once we know we're an authenticated owner.
                fetch('/api/user', { credentials: 'include', headers: { 'Accept': 'application/json' } })
                    .then(r => r.ok ? r.json() : null)
                    .then(u => { if (u && u.is_admin) { document.getElementById('approve').disabled = false; document.getElementById('deny').disabled = false; } })
                    .catch(() => {});
                document.getElementById('approve').onclick = () => act('approve');
                document.getElementById('deny').onclick = () => act('deny');
            </script>
        @endif
    </div>
</body>
</html>
