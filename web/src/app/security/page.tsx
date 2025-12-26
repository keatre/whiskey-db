'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AuthApi, type PasskeyRegisterOptionsResponse } from '../../api/auth';
import { useMe } from '../../lib/useMe';

function base64urlToUint8Array(input: string): Uint8Array {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '==='.slice((base64.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function toCreationOptions(options: PasskeyRegisterOptionsResponse): PublicKeyCredentialCreationOptions {
  return {
    ...options,
    challenge: base64urlToUint8Array(options.challenge),
    user: {
      ...options.user,
      id: base64urlToUint8Array(options.user.id),
    },
    excludeCredentials: options.excludeCredentials?.map((cred) => ({
      ...cred,
      type: 'public-key',
      id: base64urlToUint8Array(cred.id),
      transports: cred.transports as AuthenticatorTransport[] | undefined,
    })),
  };
}

export default function SecurityPage() {
  const { me, loading } = useMe();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const registerPasskey = async () => {
    setError(null);
    setSuccess(null);

    if (!window.PublicKeyCredential) {
      setError('Passkeys are not supported in this browser.');
      return;
    }
    if (!window.isSecureContext) {
      setError('Passkeys require a secure context (HTTPS).');
      return;
    }

    setSubmitting(true);
    try {
      const options = await AuthApi.passkeyRegisterOptions();
      const publicKey = toCreationOptions(options);
      const credential = (await navigator.credentials.create({
        publicKey,
      })) as PublicKeyCredential | null;
      if (!credential) {
        throw new Error('No passkey credential returned.');
      }
      const attestation = credential.response as AuthenticatorAttestationResponse;
      const transports = (attestation as any).getTransports?.();
      const payload = {
        id: credential.id,
        type: credential.type,
        rawId: bufferToBase64url(credential.rawId),
        response: {
          clientDataJSON: bufferToBase64url(attestation.clientDataJSON),
          attestationObject: bufferToBase64url(attestation.attestationObject),
          transports: transports ?? undefined,
        },
      };
      await AuthApi.passkeyRegisterVerify(payload);
      setSuccess('Passkey registered.');
    } catch (err: any) {
      setError(err?.message || 'Passkey registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p>Loading…</p>;
  }

  if (!me.authenticated) {
    return (
      <main>
        <h1>Security</h1>
        <p>You need to sign in to register a passkey.</p>
        <Link href="/signin">Go to sign in</Link>
      </main>
    );
  }

  return (
    <main>
      <h1>Security</h1>
      <p>Register a passkey so you can sign in without a password.</p>

      <button type="button" onClick={registerPasskey} disabled={submitting}>
        {submitting ? 'Registering…' : 'Register passkey'}
      </button>

      {error && <p style={{ color: 'var(--danger, #b91c1c)', marginTop: 12 }}>{error}</p>}
      {success && <p style={{ color: 'var(--success, #15803d)', marginTop: 12 }}>{success}</p>}
    </main>
  );
}
