import { FieldValue, FirestoreDataConverter, WithFieldValue } from "firebase-admin/firestore";

import { Notice, Acknowledgement } from "./interface";

export const noticeConverter: FirestoreDataConverter<Notice> = {
  toFirestore(notice: any): FirebaseFirestore.DocumentData {
    throw new Error("Creating a notice is not supported.");
  },
  fromFirestore(snapshot: FirebaseFirestore.QueryDocumentSnapshot) {
    const data = snapshot.data();

    // TODO throw if data is invalid?
    return {
      id: snapshot.id,
      type: data.type,
      title: data.title,
      description: data.description,
      link: data.link,
      createdAt: data.createdAt,
      allowList: data.allowList || [],
    };
  },
};

export const acknowledgementConverter: FirestoreDataConverter<Acknowledgement> = {
  toFirestore(
    data: WithFieldValue<Acknowledgement>
  ): FirebaseFirestore.DocumentData {
    const acknowledement = {
      createdAt: FieldValue.serverTimestamp(),
      acknowledgement: data.acknowledgement,
      userId: data.userId,
      noticeId: data.noticeId,
      metadata: data.metadata,
    };

    if (data.acknowledgement === 'acknowledged') {
      return {
        ...acknowledement,
        type: data.type || 'seen',
      };
    }

    return acknowledement;
  },
  fromFirestore(snapshot: FirebaseFirestore.DocumentSnapshot) {
    const data = snapshot.data();

    const acknowledgement = {
      id: snapshot.id,
      userId: data.userId,
      noticeId: data.noticeId,
      createdAt: data.createdAt,
      metadata: data.metadata || {},
      acknowledgement: data.acknowledgement,
    };

    if (data.acknowledgement === 'acknowledged') {
      return {
        ...acknowledgement,
        type: data.type,
      };
    }

    return acknowledgement;
  },
};
