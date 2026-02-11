-- VP Associates Whiteboard - Supabase Database Schema
-- Run this in your Supabase project's SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create storage bucket for whiteboard files
INSERT INTO storage.buckets (id, name, public)
VALUES ('whiteboard-files', 'whiteboard-files', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Whiteboards table
CREATE TABLE IF NOT EXISTS whiteboards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  canvas_state JSONB DEFAULT '{"version": 1, "elements": []}'::jsonb
);

-- Whiteboard files table
CREATE TABLE IF NOT EXISTS whiteboard_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  whiteboard_id UUID NOT NULL REFERENCES whiteboards(id) ON DELETE CASCADE,
  file_name VARCHAR(500) NOT NULL,
  file_type VARCHAR(50) NOT NULL,
  storage_path VARCHAR(1000) NOT NULL,
  file_size BIGINT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_whiteboards_project_id ON whiteboards(project_id);
CREATE INDEX IF NOT EXISTS idx_whiteboards_created_by ON whiteboards(created_by);
CREATE INDEX IF NOT EXISTS idx_whiteboards_updated_at ON whiteboards(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_whiteboard_files_whiteboard_id ON whiteboard_files(whiteboard_id);

-- Enable Row Level Security
ALTER TABLE whiteboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE whiteboard_files ENABLE ROW LEVEL SECURITY;

-- RLS Policies for whiteboards
-- Allow anyone to read whiteboards (for sharing via link)
CREATE POLICY "Allow public read access"
  ON whiteboards FOR SELECT
  USING (true);

-- Allow anyone to create whiteboards
CREATE POLICY "Allow public insert"
  ON whiteboards FOR INSERT
  WITH CHECK (true);

-- Allow anyone to update whiteboards
CREATE POLICY "Allow public update"
  ON whiteboards FOR UPDATE
  USING (true);

-- Allow anyone to delete whiteboards
CREATE POLICY "Allow public delete"
  ON whiteboards FOR DELETE
  USING (true);

-- RLS Policies for whiteboard_files
-- Allow anyone to read files
CREATE POLICY "Allow public read access"
  ON whiteboard_files FOR SELECT
  USING (true);

-- Allow anyone to insert files
CREATE POLICY "Allow public insert"
  ON whiteboard_files FOR INSERT
  WITH CHECK (true);

-- Allow anyone to delete files
CREATE POLICY "Allow public delete"
  ON whiteboard_files FOR DELETE
  USING (true);

-- Storage policies for whiteboard-files bucket
CREATE POLICY "Allow public upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'whiteboard-files');

CREATE POLICY "Allow public download"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'whiteboard-files');

CREATE POLICY "Allow public delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'whiteboard-files');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_whiteboards_updated_at
  BEFORE UPDATE ON whiteboards
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON whiteboards TO anon, authenticated;
GRANT ALL ON whiteboard_files TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_updated_at_column TO anon, authenticated;
