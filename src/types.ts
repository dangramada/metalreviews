export interface MetalReview {
  id: string; // Unique hash of band + album
  source: string; // "Angry Metal Guy" | "The Progressive Subway" | "SputnikMusic" | "Metal Storm"
  band: string;
  album: string;
  rating?: string; // Normalised rating e.g., "8.5/10"
  score: string; // e.g., "3.5/5.0", "8/10", "4.2", "8.3"
  normalizedScore: number; // 0 to 100 for unified sorting
  summary: string; // Brief excerpt/tagline
  url: string; // Direct link to the source
  publishedAt: string; // ISO string date representation
  publishedDate: string; // Formatted display date (dd MMM yyyy)
  artworkUrl: string | null;
  isDoublePositive?: boolean;
}
