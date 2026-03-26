// Custom Supabase Client Adapter for Local SQL Server
const API_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_SUPABASE_URL || (import.meta.env.PROD ? "" : "http://localhost:3000");

class CustomSupabaseClient {
  constructor(functionsUrl, anonKey) {
    this.auth = new AuthClient();
    this.storage = new StorageClient();
  }

  from(table) {
    return new QueryBuilder(table);
  }
}

class AuthClient {
  constructor() {
    this.session = null;
    this.subscribers = new Set();

    // Try to load session
    const stored = localStorage.getItem("sb-session");
    if (stored) {
      try {
        this.session = JSON.parse(stored);
      } catch (e) {}
    }
  }

  async signInWithPassword({ email, password }) {
    try {
      const res = await fetch(`${API_URL}/auth/v1/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, grant_type: "password" }),
      });
      const data = await res.json();
      if (res.ok) {
        this._setSession(data.session);
        return { data, error: null };
      }
      return { data: null, error: { message: data.error } };
    } catch (e) {
      return { data: null, error: e };
    }
  }

  async signUp({ email, password, options }) {
    try {
      const res = await fetch(`${API_URL}/auth/v1/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, options }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.session) this._setSession(data.session);
        // Ensure we pass through any extra fields like dev_token
        return { data, error: null };
      }
      return { data: null, error: { message: data.error } };
    } catch (e) {
      return { data: null, error: e };
    }
  }

  async signOut() {
    this._setSession(null);
    return { error: null };
  }

  async getSession() {
    return { data: { session: this.session }, error: null };
  }

  async setSession(session) {
    this._setSession(session);
    return { data: { session }, error: null };
  }

  onAuthStateChange(callback) {
    this.subscribers.add(callback);
    // return unsubscribe
    return {
      data: {
        subscription: { unsubscribe: () => this.subscribers.delete(callback) },
      },
    };
  }

  _setSession(session) {
    this.session = session;
    if (session) {
      localStorage.setItem("sb-session", JSON.stringify(session));
      this._notify("SIGNED_IN", session);
    } else {
      localStorage.removeItem("sb-session");
      this._notify("SIGNED_OUT", null);
    }
  }

  _notify(event, session) {
    this.subscribers.forEach((cb) => cb(event, session));
  }
}

class QueryBuilder {
  constructor(table) {
    this.table = table;
    this.queryParams = {};
    this.method = "GET";
    this.body = null;
    this.isSingle = false;
    this.isMaybeSingle = false;
    this.options = {};
  }

  select(columns = "*", options = {}) {
    if (this.method === "GET") {
      // Keep it GET
    }
    // If it is POST/PATCH/DELETE, do not overwrite to GET.
    this.queryParams.select = columns;
    this.options = options;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this;
  }

  insert(data) {
    this.method = "POST";
    this.body = data;
    return this;
  }

  upsert(data, options = {}) {
    this.method = "POST";
    this.body = data;
    this.queryParams["_upsert"] = "true";
    if (options.onConflict) {
      this.queryParams["_on_conflict"] = options.onConflict;
    }
    if (options.ignoreDuplicates) {
      this.queryParams["_ignore_duplicates"] = "true";
    }
    return this;
  }

  update(data) {
    this.method = "PATCH";
    this.body = data;
    return this;
  }

  // Delete usually doesn't take args in supabase, it waits for filters
  delete() {
    this.method = "DELETE";
    return this;
  }

  eq(column, value) {
    this.queryParams[column] = value;
    return this;
  }

  in(column, values) {
    this.queryParams[column] = `in.(${values.join(",")})`;
    return this;
  }

  ilike(column, pattern) {
    this.queryParams[column] = `ilike.${pattern}`;
    return this;
  }

  limit(count) {
    this.options.limit = count;
    // For GET querystring if needed or post-processing
    this.queryParams["limit"] = count;
    return this;
  }

  gt(column, value) {
    this.queryParams[column] = `gt.${value}`;
    return this;
  }

  lt(column, value) {
    this.queryParams[column] = `lt.${value}`;
    return this;
  }

  gte(column, value) {
    this.queryParams[column] = `gte.${value}`;
    return this;
  }

  lte(column, value) {
    this.queryParams[column] = `lte.${value}`;
    return this;
  }

  or(query) {
    this.queryParams["or"] = `(${query})`;
    return this;
  }

  order(column, { ascending = true } = {}) {
    this.queryParams.order = `${column}.${ascending ? "asc" : "desc"}`;
    return this;
  }

  // To execute the promise
  then(resolve, reject) {
    this.exec().then(resolve).catch(reject);
  }

  async exec() {
    const headers = { "Content-Type": "application/json" };
    const session = JSON.parse(localStorage.getItem("sb-session") || "null");
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }

    const queryString = new URLSearchParams(this.queryParams).toString();
    const url = `${API_URL}/api/${this.table}?${queryString}`;

    try {
      const res = await fetch(url, {
        method: this.method,
        headers,
        body: this.body ? JSON.stringify(this.body) : undefined,
      });

      if (!res.ok) {
        const text = await res.text();
        let err;
        try {
          err = JSON.parse(text);
        } catch {
          err = { error: text || res.statusText };
        }
        return { data: null, error: { message: err.error || res.statusText } };
      }

      if (res.status === 204) {
        return { data: null, error: null };
      }

      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      let count = null;
      if (this.options && this.options.count) {
        count = Array.isArray(data) ? data.length : 0;
      }

      if (this.options && this.options.head) {
        return { data: null, count, error: null };
      }

      if (this.isSingle) {
        if (!Array.isArray(data) || data.length === 0) {
          return {
            data: null,
            count,
            error: {
              message: "JSON object requested, multiple (or no) rows returned",
              code: "PGRST116",
            },
          };
        }
        if (data.length > 1) {
          return {
            data: null,
            count,
            error: {
              message: "JSON object requested, multiple rows returned",
              code: "PGRST116",
            },
          };
        }
        return { data: data[0], count, error: null };
      }

      if (this.isMaybeSingle) {
        if (!Array.isArray(data) || data.length === 0) {
          return { data: null, count, error: null };
        }
        if (data.length > 1) {
          return {
            data: null,
            count,
            error: {
              message: "JSON object requested, multiple rows returned",
              code: "PGRST116",
            },
          };
        }
        return { data: data[0], count, error: null };
      }

      return { data, count, error: null };
    } catch (e) {
      return { data: null, error: e };
    }
  }
}

class StorageClient {
  from(bucket) {
    return {
      upload: async (path, fileBody) => {
        const formData = new FormData();
        formData.append("file", fileBody);

        try {
          const res = await fetch(
            `${API_URL}/storage/v1/object/${bucket}/${path}`,
            {
              method: "POST",
              body: formData,
              // No Content-Type header, let browser set boundary
            },
          );
          const data = await res.json();
          if (!res.ok) return { data: null, error: data };
          return { data, error: null };
        } catch (e) {
          return { data: null, error: e };
        }
      },
      getPublicUrl: (path) => {
        // Return URL directly
        // Use full path, do not strip folders
        return {
          data: {
            publicUrl: `${API_URL}/storage/v1/object/public/${bucket}/${path}`,
          },
        };
      },
    };
  }
}

export function createClient(url, key) {
  return new CustomSupabaseClient(url, key);
}
