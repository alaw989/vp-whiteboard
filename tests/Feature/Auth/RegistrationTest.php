<?php

namespace Tests\Feature\Auth;

use App\Mail\NewRegistrationRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class RegistrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_new_users_are_created_pending_and_not_authenticated(): void
    {
        $response = $this->post('/register', [
            'name' => 'Test User',
            'email' => 'test@example.com',
            'password' => 'password',
            'password_confirmation' => 'password',
        ]);

        $response->assertCreated();

        $this->assertDatabaseHas('users', [
            'email' => 'test@example.com',
            'status' => 'pending',
        ]);

        $this->assertGuest();
    }

    public function test_registration_notifies_each_admin_email(): void
    {
        config(['mail.admin_email' => 'vphan@vp-associates.com, alaw989@gmail.com']);
        Mail::fake();

        $this->post('/register', [
            'name' => 'Test User',
            'email' => 'test@example.com',
            'password' => 'password',
            'password_confirmation' => 'password',
        ])->assertCreated();

        Mail::assertSent(NewRegistrationRequest::class, function (NewRegistrationRequest $mail) {
            return $mail->hasTo('vphan@vp-associates.com')
                && $mail->hasTo('alaw989@gmail.com');
        });
    }

    public function test_registration_succeeds_when_approval_email_fails(): void
    {
        config(['mail.admin_email' => 'owner@example.com']);

        $transport = new class implements \Symfony\Component\Mailer\Transport\TransportInterface
        {
            public function send(\Symfony\Component\Mime\RawMessage $message, ?\Symfony\Component\Mailer\Envelope $envelope = null): ?\Symfony\Component\Mailer\SentMessage
            {
                throw new \RuntimeException('SMTP connection refused');
            }

            public function __toString(): string
            {
                return 'throwing';
            }
        };

        Mail::mailer()->setSymfonyTransport($transport);

        $this->post('/register', [
            'name' => 'Test User',
            'email' => 'test@example.com',
            'password' => 'password',
            'password_confirmation' => 'password',
        ])->assertCreated();

        $this->assertDatabaseHas('users', [
            'email' => 'test@example.com',
            'status' => 'pending',
        ]);
    }
}
