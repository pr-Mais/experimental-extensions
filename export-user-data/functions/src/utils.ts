/*
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import admin from "firebase-admin";
import { eventChannel } from ".";
import config from "./config";
import { ExportPaths } from "./get_export_paths";
import * as log from "./logs";

export const replaceUID = (path: string, uid: string) =>
  path.replace(/{UID}/g, uid);

export const getDatabaseUrl = (
  selectedDatabaseInstance: string | undefined,
  selectedDatabaseLocation: string | undefined
) => {
  if (!selectedDatabaseLocation || !selectedDatabaseInstance) return null;

  if (selectedDatabaseLocation === "us-central1")
    return `https://${selectedDatabaseInstance}.firebaseio.com`;

  return `https://${selectedDatabaseInstance}.${selectedDatabaseLocation}.firebasedatabase.app`;
};

export const getFilesFromStoragePath = async (path: string) => {
  const parts = path.split("/");
  const bucketName = parts[0];
  const bucket =
    bucketName === "{DEFAULT}"
      ? admin.storage().bucket(config.storageBucketDefault)
      : admin.storage().bucket(bucketName);

  const prefix = parts.slice(1).join("/");
  const files = await bucket.getFiles({ prefix });

  return files;
};

/**
 * Initialize the export by creating a record in the exports collection.
 * @param uid userId
 * @returns exportId, the id of the export document in the exports collection
 */
export const initializeExport = async (uid: string) => {
  const startedAt = admin.firestore.FieldValue.serverTimestamp();

  log.startExport(uid);

  const exportDoc = await admin
    .firestore()
    .collection(config.firestoreExportsCollection || "exports")
    .add({
      uid,
      status: "pending",
      startedAt,
    });

  if (eventChannel) {
    await eventChannel.publish({
      type: `firebase.extensions.export-user-data.v1`,
      data: JSON.stringify({
        uid,
        exportId: exportDoc.id,
        startedAt,
      }),
    });
  }
  return exportDoc.id;
};

/**
 * On completion of the export, updates the export document in the exports collection.
 * @param storagePrefix the path to the exported data in Cloud Storage
 * @param uid userId
 * @param exportId the id of the record of the export in firestore
 */
export const finalizeExport = async (
  storagePrefix: string,
  uid: string,
  exportId: string,
  exportPaths: ExportPaths
) => {
  await admin
    .firestore()
    .doc(`exports/${exportId}`)
    .update({
      status: "complete",
      storagePath: `${storagePrefix}`,
      zipPath: config.zip ? `${storagePrefix}/${exportId}_${uid}.zip` : null,
    });
  log.completeExport(uid);

  if (eventChannel) {
    await eventChannel.publish({
      type: `firebase.extensions.export-user-data.v1.export-complete`,
      data: JSON.stringify({
        uid,
        exportId,
        storagePath: `${storagePrefix}`,
        zipPath: config.zip ? `${storagePrefix}/${exportId}_${uid}.zip` : null,
        exportPaths,
      }),
    });
  }
};
