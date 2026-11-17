// src/services/supabaseService.ts — User-owned OpenAPI spec storage.

import { supabase } from '../lib/supabase';
import type { SpecAnalysis } from '../types';

export const STORAGE_BUCKET = 'aegis-storage';

// ── Storage Operations ───────────────────────────────────────────────────────

export async function uploadToStorage(
  filePath: string,
  content: string | Blob,
  contentType: string = 'application/json'
): Promise<string | null> {
  try {
    const body = typeof content === 'string' ? new Blob([content], { type: contentType }) : content;
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, body, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.warn('Supabase storage upload error:', error.message);
      return null;
    }

    // Artifacts live in a private bucket. Store an object reference, never a
    // public URL that could leak scan responses or OpenAPI documents.
    return `storage://${filePath}`;
  } catch (err) {
    console.warn('Storage upload exception:', err);
    return null;
  }
}

export async function downloadFromStorage(filePath: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(filePath);
    if (error || !data) return null;
    return await data.text();
  } catch {
    return null;
  }
}

// ── OpenAPI Specs Storage & Database Persistence ──────────────────────────────

export async function persistSpecToSupabase(
  file: File | null,
  specUrl: string | null,
  analysis: SpecAnalysis
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    let storageUrl: string | null = null;
    let textContent: string | null = null;

    if (file) {
      textContent = await file.text();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      storageUrl = await uploadToStorage(
        `specs/${user?.id || 'guest'}/${Date.now()}_${sanitizedName}`,
        textContent,
        'application/json'
      );
    }

    const row = {
      id: analysis.spec_id || crypto.randomUUID(),
      user_id: user?.id || null,
      filename: file?.name || (specUrl ? new URL(specUrl).pathname.split('/').pop() || 'openapi.json' : 'openapi.json'),
      content: textContent ? textContent.slice(0, 50_000) : null,
      spec_url: storageUrl || specUrl || null,
      version: analysis.version || '3.0.0',
      endpoints: analysis.total_endpoints || 0,
      metadata: {
        title: analysis.title,
        endpoints: analysis.endpoints,
        storage_url: storageUrl,
      },
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('spec_uploads').upsert(row, { onConflict: 'id' });
    if (error) {
      console.warn('Failed to upsert spec to Supabase:', error.message);
    }
  } catch (err) {
    console.warn('Exception in persistSpecToSupabase:', err);
  }
}

export async function fetchSpecUploadsFromSupabase(): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('spec_uploads')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}
