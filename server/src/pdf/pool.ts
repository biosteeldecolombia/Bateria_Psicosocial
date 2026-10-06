import { Worker } from 'node:worker_threads';
import type { ExpedienteData, Professional } from './expediente.js';
import type { BuildRequest, BuildResponse } from './worker.js';

/**
 * Generador de expedientes en un hilo aparte con límite de memoria (V8 recolecta de forma más agresiva),
 * para que una exportación de cientos de personas no bloquee las demás peticiones ni agote la RAM.
 */
export class PdfWorker {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, { resolve: (b: Uint8Array) => void; reject: (e: Error) => void }>();

  constructor(maxMemoryMb = 640) {
    const fromSource = import.meta.url.endsWith('.ts'); // desarrollo/pruebas (tsx) vs. compilado (tsup → dist/pdf-worker.js)
    const url = new URL(fromSource ? './worker.ts' : './pdf-worker.js', import.meta.url);
    this.worker = new Worker(url, {
      resourceLimits: { maxOldGenerationSizeMb: maxMemoryMb },
      execArgv: fromSource ? ['--import', 'tsx'] : [],
    });
    this.worker.on('message', (m: BuildResponse) => {
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if ('error' in m) p.reject(new Error(m.error));
      else p.resolve(m.bytes);
    });
    const fail = (e: Error) => {
      for (const p of this.pending.values()) p.reject(e);
      this.pending.clear();
    };
    this.worker.on('error', fail);
    this.worker.on('exit', (code) => code !== 0 && fail(new Error(`El generador de PDF terminó con código ${code}`)));
  }

  build(expediente: ExpedienteData, professional: Professional, generatedAt: Date): Promise<Uint8Array> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, expediente, professional, generatedAt } satisfies BuildRequest);
    });
  }

  close() {
    return this.worker.terminate();
  }
}
