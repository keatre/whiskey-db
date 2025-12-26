'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthApi, type PasskeyOptionsResponse } from '../../api/auth'; // relative to web/src/api/auth.ts

export default function LoginClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') || '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [passkeySubmitting, setPasskeySubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  function toCredentialRequestOptions(options: PasskeyOptionsResponse): PublicKeyCredentialRequestOptions {
    return {
      ...options,
      challenge: base64urlToUint8Array(options.challenge),
      allowCredentials: options.allowCredentials?.map((cred) => ({
        ...cred,
        id: base64urlToUint8Array(cred.id),
      })),
    };
  }

  async function doLogin() {
    setSubmitting(true);
    setError(null);
    try {
      const me = await AuthApi.login(username, password);
      router.replace(next);
    } catch (err: any) {
      setError(err?.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function doPasskeyLogin() {
    if (!username.trim()) {
      setError('Enter your username to use passkey sign-in.');
      return;
    }
    if (!window.PublicKeyCredential) {
      setError('Passkeys are not supported in this browser.');
      return;
    }
    if (!window.isSecureContext) {
      setError('Passkeys require a secure context (HTTPS).');
      return;
    }

    setPasskeySubmitting(true);
    setError(null);
    try {
      const options = await AuthApi.passkeyOptions(username.trim());
      const publicKey = toCredentialRequestOptions(options);
      const credential = (await navigator.credentials.get({
        publicKey,
      })) as PublicKeyCredential | null;
      if (!credential) {
        throw new Error('No passkey credential returned.');
      }
      const assertion = credential.response as AuthenticatorAssertionResponse;
      const payload = {
        id: credential.id,
        type: credential.type,
        rawId: bufferToBase64url(credential.rawId),
        response: {
          clientDataJSON: bufferToBase64url(assertion.clientDataJSON),
          authenticatorData: bufferToBase64url(assertion.authenticatorData),
          signature: bufferToBase64url(assertion.signature),
          userHandle: assertion.userHandle ? bufferToBase64url(assertion.userHandle) : null,
        },
      };
      await AuthApi.passkeyVerify(username.trim(), payload);
      router.replace(next);
    } catch (err: any) {
      setError(err?.message || 'Passkey sign-in failed');
    } finally {
      setPasskeySubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="text-2xl font-semibold mb-6">Sign in</h1>

      {/* No <form> tag = no implicit navigation */}
      <div>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          aria-label="Username"
          className="w-full mb-3 rounded px-3 py-2 text-black"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />

        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-label="Password"
          className="w-full mb-3 rounded px-3 py-2 text-black"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button
          type="button"
          onClick={doLogin}
          disabled={submitting}
          className="rounded px-4 py-2 bg-blue-600 disabled:opacity-60"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <button
          type="button"
          onClick={doPasskeyLogin}
          disabled={passkeySubmitting}
          className="mt-3 rounded px-4 py-2 bg-slate-700 disabled:opacity-60"
        >
          {passkeySubmitting ? 'Signing in…' : 'Sign in with Passkey'}
        </button>

        {error && <p className="mt-3 text-red-400">{error}</p>}

        <p className="mt-3 text-sm opacity-70">
          Access to data outside your LAN requires authentication.
        </p>
      </div>
    </div>
  );
}
