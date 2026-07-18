import { useThree } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import { PerspectiveCamera, type Camera } from 'three';
import { CINEMATIC_CONFIG } from '../config/cinematicConfig';
import { sampleCamera, type CameraSample } from './cameraPath';

const applyCameraSample = (camera: Camera, sample: CameraSample): void => {
  camera.position.copy(sample.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(sample.target);
  camera.rotateZ(sample.bank);
  if (camera instanceof PerspectiveCamera) {
    camera.fov = sample.fov;
    camera.near = CINEMATIC_CONFIG.camera.near;
    camera.far = CINEMATIC_CONFIG.camera.far;
    camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld();
};

export const CinematicCamera = ({ frame, progress }: { frame: number; progress: number }) => {
  const camera = useThree((threeState) => threeState.camera);
  const sample = sampleCamera(progress, frame);

  useLayoutEffect(() => {
    applyCameraSample(camera, sample);
  }, [camera, sample]);

  return null;
};
