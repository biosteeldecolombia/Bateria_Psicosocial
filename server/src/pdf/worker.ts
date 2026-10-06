// Hilo de trabajo para generar expedientes PDF sin bloquear el servidor y con la memoria acotada.
import { parentPort } from 'node:worker_threads';
import { buildExpediente, type ExpedienteData, type Professional } from './expediente.js';

export interface BuildRequest {
  id: number;
  expediente: ExpedienteData;
  professional: Professional;
  generatedAt: Date;
}
export type BuildResponse = { id: number; bytes: Uint8Array } | { id: number; error: string };

parentPort!.on('message', async (req: BuildRequest) => {
  try {
    const bytes = await buildExpediente(req.expediente, req.professional, req.generatedAt);
    // Se transfiere el buffer (sin copiarlo)
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    parentPort!.postMessage({ id: req.id, bytes: copy } satisfies BuildResponse, [copy.buffer]);
  } catch (e) {
    parentPort!.postMessage({ id: req.id, error: (e as Error).message } satisfies BuildResponse);
  }
});
