import { supabase } from "@/integrations/supabase/client";

export type DocumentRow = {
  id: string;
  user_id: string;
  folder_id: string | null;
  title: string;
  doc_type: string;
  source: string;
  file_path: string | null;
  mime_type: string | null;
  file_size: number;
  page_count: number;
  prompt: string | null;
  content: string | null;
  summary: string | null;
  tags: string[];
  is_favorite: boolean;
  last_opened_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FolderRow = { id: string; name: string; color: string; created_at: string };

export async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("You need to be signed in.");
  return data.user.id;
}

export async function saveDocument(input: {
  title: string;
  docType: string;
  source: "ai" | "scan" | "image";
  blob: Blob;
  pageCount: number;
  prompt?: string | null;
  content?: string | null;
  summary?: string | null;
  folderId?: string | null;
}) {
  const userId = await currentUserId();
  const path = `${userId}/${crypto.randomUUID()}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(path, input.blob, { contentType: "application/pdf", upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("documents")
    .insert({
      user_id: userId,
      title: input.title,
      doc_type: input.docType,
      source: input.source,
      file_path: path,
      mime_type: "application/pdf",
      file_size: input.blob.size,
      page_count: input.pageCount,
      prompt: input.prompt ?? null,
      content: input.content ?? null,
      summary: input.summary ?? null,
      folder_id: input.folderId ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as DocumentRow;
}

export async function listDocuments() {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DocumentRow[];
}

export async function getDocument(id: string) {
  const { data, error } = await supabase.from("documents").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as DocumentRow) ?? null;
}

export async function listFolders() {
  const { data, error } = await supabase.from("folders").select("*").order("created_at");
  if (error) throw error;
  return (data ?? []) as FolderRow[];
}

export async function createFolder(name: string) {
  const userId = await currentUserId();
  const { error } = await supabase.from("folders").insert({ user_id: userId, name });
  if (error) throw error;
}

export async function updateDocument(id: string, patch: Partial<DocumentRow>) {
  const { error } = await supabase.from("documents").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteDocument(doc: DocumentRow) {
  if (doc.file_path) await supabase.storage.from("documents").remove([doc.file_path]);
  const { error } = await supabase.from("documents").delete().eq("id", doc.id);
  if (error) throw error;
}

export async function signedUrl(path: string, seconds = 3600) {
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}

export function downloadUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
}