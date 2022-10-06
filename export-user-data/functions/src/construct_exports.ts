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
import { Archiver } from "archiver";
import * as sync from "csv-stringify/sync";
import admin from "firebase-admin";
import { v4 as uuidv4 } from "uuid";
import config from "./config";
const HEADERS = ["TYPE", "path", "data"];
import { File } from "@google-cloud/storage";
import { replaceUID } from "./utils";
import * as log from "./logs";

const dataSources = {
  firestore: "FIRESTORE",
  database: "DATABASE",
  storage: "STORAGE",
};

export const constructFirestoreCollectionCSV = (
  snap: FirebaseFirestore.QuerySnapshot,
  collectionPath: string
) => {
  const csvData = snap.docs.map((doc) => {
    const path = `${collectionPath}/${doc.id}`;

    return [dataSources.firestore, path, JSON.stringify(doc.data())];
  });

  csvData.unshift(HEADERS);

  return sync.stringify(csvData);
};

export const constructFirestoreDocumentCSV = (
  snap: FirebaseFirestore.DocumentSnapshot,
  documentPath: string
) => {
  const csvData = [HEADERS];

  const data = snap.data();

  for (let key in data) {
    const path = `${documentPath}/${key}`;
    csvData.push([dataSources.firestore, path, JSON.stringify(data[key])]);
  }

  return sync.stringify(csvData);
};

export const constructDatabaseCSV = async (snap: any, databasePath: string) => {
  const csvData = [HEADERS];

  const data = snap.val();

  for (let key in data) {
    const path = `${databasePath}/${key}`;
    csvData.push([dataSources.database, path, JSON.stringify(data[key])]);
  }

  return sync.stringify(csvData);
};

export const copyStorageFilesToExportDirectory = async (
  storagePaths: unknown[],
  uid: string
) => {
  let filePromises: Promise<File>[] = [];

  // if there are storage paths, we copy files across to the new bucket
  if (storagePaths.length > 0) {
    for (let path of storagePaths) {
      if (typeof path === "string") {
        const pathWithUID = replaceUID(path, uid);
        filePromises = [
          ...filePromises,
          ...(await copyStorageFilesAtPathToExportDirectory(pathWithUID)),
        ];
      } else {
        log.storagePathNotString();
      }
    }
  }

  return Promise.all(filePromises);
};

export const copyStorageFilesAtPathToExportDirectory = async (
  pathWithUID: string
): Promise<Promise<File>[]> => {
  const originalParts = pathWithUID.split("/");

  const originalBucket =
    originalParts[0] === "{DEFAULT}"
      ? admin.storage().bucket(config.storageBucketDefault)
      : admin.storage().bucket(originalParts[0]);

  const originalPrefix = originalParts.slice(1).join("/");
  const outputBucket = admin.storage().bucket(config.storageBucketDefault);

  const originalFiles = (
    await originalBucket.getFiles({ prefix: originalPrefix })
  )[0];

  return originalFiles.map(async (file) => {
    const originalExtension = file.name.split(".").pop();
    const newPrefix = `${config.cloudStorageExportDirectory}/${uuidv4()}${
      originalExtension ? "." + originalExtension : ""
    }`;

    return file
      .copy(outputBucket.file(newPrefix), {
        metadata: {
          customMetadata: {
            originalPath: `${originalBucket.name}/${file.name}`,
          },
        },
      })
      .then(([file, _]) => {
        return file;
      });
  });
};
