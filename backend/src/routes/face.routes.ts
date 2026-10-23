import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import {
  captureFaceSample,
  captureFaceSampleBatch,
  getFaceModelStatus,
  recognizeFace,
  trainFaceModel,
} from "../controllers/face.controller";

const router: Router = Router();

router.get("/status", asyncHandler(getFaceModelStatus));
router.post("/capture", asyncHandler(captureFaceSample));
router.post("/capture/batch", asyncHandler(captureFaceSampleBatch));
router.post("/train", asyncHandler(trainFaceModel));
router.post("/recognize", asyncHandler(recognizeFace));

export default router;