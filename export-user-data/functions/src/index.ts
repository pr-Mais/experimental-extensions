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

import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import * as functions from "firebase-functions";
import { getEventarc } from "firebase-admin/eventarc";
import config from "./config";
import * as log from "./logs";
import { ExportPaths, getExportPaths } from "./get_export_paths";
import { uploadDataAsZip } from "./upload_as_zip";
import { uploadAsCSVs } from "./upload_as_csv";
import { getDatabaseUrl } from "./utils";

const databaseURL = getDatabaseUrl(
  config.selectedDatabaseInstance,
  config.selectedDatabaseLocation
);

// Initialize the Firebase Admin SDK
admin.initializeApp({
  databaseURL,
});

export const eventChannel =
  process.env.EVENTARC_CHANNEL &&
  getEventarc().channel(process.env.EVENTARC_CHANNEL, {
    allowedEventTypes: process.env.EXT_SELECTED_EVENTS,
  });
/**
 * Export user data from Cloud Firestore, Realtime Database, and Cloud Storage.
 */
export const exportUserData = functions.https.onCall(async (_data, context) => {
  // get the user id
  const uid = context.auth.uid;
  // create a record of the export in firestore and get its id
  const exportId = await initializeExport(uid);
  // this is the path to the exported data in Cloud Storage
  const storagePrefix = `${
    config.cloudStorageExportDirectory || ""
  }/${uid}/${exportId}`;
  // get the paths specified by config and/or custom hook.
  const exportPaths = await getExportPaths(uid);

  if (config.zip) {
    try {
      await uploadDataAsZip(exportPaths, storagePrefix, uid, exportId);
    } catch (e) {
      log.exportError(e);
    }
  } else {
    await uploadAsCSVs(exportPaths, uid, exportId);
  }

  await finalizeExport(storagePrefix, uid, exportId, exportPaths);

  return { exportId };
});

/**
 * Initialize the export by creating a record in the exports collection.
 * @param uid userId
 * @returns exportId, the id of the export document in the exports collection
 */
const initializeExport = async (uid: string) => {
  const startedAt = FieldValue.serverTimestamp();

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
      type: `firebase.google.v1.export-pending`,
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
const finalizeExport = async (
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
      type: `firebase.google.v1.export-complete`,
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
