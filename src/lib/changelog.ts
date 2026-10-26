export const CHANGELOG_REPO_URL = 'https://github.com/Strako/El-rival-menos-peor';
export const CHANGELOG_API_URL =
  'https://api.github.com/repos/Strako/El-rival-menos-peor/commits?per_page=15';

export interface ChangelogCommit {
  sha: string;
  shortSha: string;
  title: string;
  author: string;
  date: string;
  url: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export function parseGithubCommit(input: unknown): ChangelogCommit | null {
  const item = asRecord(input);
  if (!item) return null;
  const commit = asRecord(item.commit);
  if (!commit) return null;

  const sha = typeof item.sha === 'string' ? item.sha : '';
  const url = typeof item.html_url === 'string' ? item.html_url : '';
  const message = typeof commit.message === 'string' ? commit.message : '';
  const authorData = asRecord(commit.author);
  const author = typeof authorData?.name === 'string' ? authorData.name : 'GitHub';
  const date = typeof authorData?.date === 'string' ? authorData.date : '';
  const title = message.split('\n')[0]?.trim() ?? '';

  if (!sha || !url || !title) return null;

  return {
    sha,
    shortSha: sha.slice(0, 7),
    title,
    author,
    date,
    url,
  };
}

export function formatChangelogDate(value: string): string {
  if (!value) return 'Fecha desconocida';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha desconocida';
  return date.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export async function fetchChangelogCommits(): Promise<ChangelogCommit[]> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(CHANGELOG_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`GitHub respondió ${response.status}`);
    }
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error('Respuesta de GitHub inválida');
    }
    return payload
      .map(parseGithubCommit)
      .filter((commit): commit is ChangelogCommit => Boolean(commit));
  } finally {
    window.clearTimeout(timeout);
  }
}
