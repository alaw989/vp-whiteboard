<template>
  <div class="whiteboard-container" ref="containerRef">
    <!-- Stage (Konva container) -->
    <v-stage
      ref="stageRef"
      :config="stageConfig"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @mouseleave="handleMouseUp"
      @wheel="handleWheel"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointerleave="handlePointerLeave"
      @pointercancel="handlePointerCancel"
      @click="handleStageClick"
    >
      <!-- Main Layer (background, document layers, drawings, annotations) -->
      <v-layer ref="layerRef">
        <!-- Background -->
        <v-rect
          :config="{
            x: 0,
            y: 0,
            width: stageConfig.width,
            height: stageConfig.height,
            fill: '#f5f5f5',
          }"
        />

        <!-- Grid lines -->
        <template v-if="grid.gridEnabled.value">
          <v-line
            v-for="(gl, idx) in gridLines"
            :key="'grid-' + idx"
            :config="{
              points: gl.type === 'vertical'
                ? [gl.position, -10000, gl.position, 10000]
                : [-10000, gl.position, 10000, gl.position],
              stroke: '#ddd',
              strokeWidth: 0.5,
              listening: false,
              perfectDrawEnabled: false,
            }"
          />
        </template>
        <!-- Document layers (PDFs, images) - rendered between background and drawings -->
        <template v-for="layer in visibleLayers" :key="layer.id">
          <v-group :config="{
            x: layer.x,
            y: layer.y,
            scaleX: layer.scale,
            scaleY: layer.scale,
            opacity: layer.opacity,
          }">
            <v-image
              :config="{
                image: getLayerImage(layer.src),
                width: layer.width,
                height: layer.height,
                listening: false,
              }"
            />
          </v-group>
        </template>
        <!-- Note: viewport transform is applied at stage level via stageConfig,
             so elements are rendered in their natural canvas coordinates -->
        <v-group :config="{ x: 0, y: 0 }">
          <!-- Render visible elements (viewport clipped for performance) -->
          <template v-for="element in visibleElements" :key="element.id">
            <!-- Stroke elements (freehand drawing) - rendered as filled polygon -->
            <v-line
              v-if="element.type === 'stroke'"
              :config="{
                ...getStrokeConfig(element),
                closed: true,
                id: element.id,
              }"
              @click="handleElementClick(element, $event)"
              @dragstart="handleDragStart"
              @dragmove="handleDragMove"
              @dragend="handleDragEnd"
            />

            <!-- Line elements -->
            <v-line
              v-else-if="element.type === 'line'"
              :config="{
                ...getLineConfig(element),
                id: element.id,
              }"
              @click="handleElementClick(element, $event)"
              @dragstart="handleDragStart"
              @dragmove="handleDragMove"
              @dragend="handleDragEnd"
            />

            <!-- Arrow elements -->
            <v-arrow
              v-else-if="element.type === 'arrow'"
              :config="{
                ...getArrowConfig(element),
                id: element.id,
              }"
              @click="handleElementClick(element, $event)"
              @dragstart="handleDragStart"
              @dragmove="handleDragMove"
              @dragend="handleDragEnd"
            />

            <!-- Rectangle elements -->
            <v-rect
              v-else-if="element.type === 'rectangle'"
              :config="{
                ...getRectConfig(element),
                id: element.id,
              }"
              @click="handleElementClick(element, $event)"
              @dragstart="handleDragStart"
              @dragmove="handleDragMove"
              @dragend="handleDragEnd"
            />

            <!-- Circle elements -->
            <v-circle
              v-else-if="element.type === 'circle'"
              :config="{
                ...getCircleConfig(element),
                id: element.id,
              }"
              @click="handleElementClick(element, $event)"
              @dragstart="handleDragStart"
              @dragmove="handleDragMove"
              @dragend="handleDragEnd"
            />

            <!-- Ellipse elements -->
            <v-ellipse
              v-else-if="element.type === 'ellipse'"
              :config="{
                ...getEllipseConfig(element),
                id: element.id,
              }"
              @click="handleElementClick(element, $event)"
              @dragstart="handleDragStart"
              @dragmove="handleDragMove"
              @dragend="handleDragEnd"
            />

            <!-- Polyline elements -->
            <v-line
              v-else-if="element.type === 'polyline'"
              :config="{
                ...getPolylineConfig(element),
                id: element.id,
              }"
              @click="handleElementClick(element, $event)"
              @dragstart="handleDragStart"
              @dragmove="handleDragMove"
              @dragend="handleDragEnd"
            />

            <!-- Arc elements -->
            <v-line
              v-else-if="element.type === 'arc'"
              :config="{
                ...getArcConfig(element),
                id: element.id,
              }"
              @click="handleElementClick(element, $event)"
              @dragstart="handleDragStart"
              @dragmove="handleDragMove"
              @dragend="handleDragEnd"
            />

            <!-- Revision cloud elements -->
            <v-line
              v-else-if="element.type === 'revision-cloud'"
              :config="{
                ...getRevisionCloudConfig(element),
                id: element.id,
              }"
              @click="handleElementClick(element, $event)"
              @dragstart="handleDragStart"
              @dragmove="handleDragMove"
              @dragend="handleDragEnd"
            />

            <!-- Fillet arc elements -->
            <v-line
              v-else-if="element.type === 'fillet-arc'"
              :config="{
                ...getFilletArcConfig(element),
                id: element.id,
              }"
              @click="handleElementClick(element, $event)"
              @dragstart="handleDragStart"
              @dragmove="handleDragMove"
              @dragend="handleDragEnd"
            />

            <!-- Dimension elements -->
            <template v-else-if="element.type === 'dimension'">
              <template v-for="(cfg, idx) in getDimensionConfigs(element)" :key="element.id + '-d-' + idx">
                <v-line :config="cfg" />
              </template>
              <v-text
                :config="getDimensionTextConfig(element)"
              />
            </template>

            <!-- Image elements -->
            <v-image
              v-else-if="element.type === 'image'"
              :config="{
                ...getImageConfig(element),
                id: element.id,
              }"
              @click="handleElementClick(element, $event)"
              @dragstart="handleDragStart"
              @dragmove="handleDragMove"
              @dragend="handleDragEnd"
            />

            <!-- Text elements -->
            <v-text
              v-else-if="element.type === 'text'"
              :config="{
                ...getTextConfig(element),
                id: element.id,
              }"
              @click="handleElementClick(element, $event)"
              @dragstart="handleDragStart"
              @dragmove="handleDragMove"
              @dragend="handleDragEnd"
            />

            <!-- Text annotation elements (text + leader line in group) -->
            <v-group
              v-else-if="element.type === 'text-annotation'"
              :config="{
                ...getTextAnnotationConfig(element),
                id: element.id,
              }"
              @click="handleElementClick(element, $event)"
              @dragstart="handleDragStart"
              @dragmove="handleDragMove"
              @dragend="handleDragEnd"
            >
              <v-line :config="getTextAnnotationLineConfig(element)" />
              <v-text :config="getTextAnnotationTextConfig(element)" />
            </v-group>

            <!-- Stamp elements (rect + text in group) -->
            <v-group
              v-else-if="element.type === 'stamp'"
              :config="{
                ...getStampGroupConfig(element),
                id: element.id,
              }"
              @click="handleElementClick(element, $event)"
              @dragstart="handleDragStart"
              @dragmove="handleDragMove"
              @dragend="handleDragEnd"
            >
              <v-rect :config="getStampRectConfig(element)" />
              <v-text :config="getStampTextConfig(element)" />
            </v-group>

            <!-- Distance measurement elements (line + anchors + label in group) -->
            <v-group
              v-else-if="element.type === 'measurement-distance'"
              :config="{
                ...getMeasurementGroupConfig(element),
                id: element.id,
              }"
              @click="handleElementClick(element, $event)"
              @dragstart="handleDragStart"
              @dragmove="handleDragMove"
              @dragend="handleDragEnd"
            >
              <v-line :config="getMeasurementLineConfig(element)" />
              <v-circle :config="getMeasurementStartAnchor(element)" />
              <v-circle :config="getMeasurementEndAnchor(element)" />
              <v-text :config="getMeasurementLabelConfig(element)" />
            </v-group>

            <!-- Area measurement elements (label positioned above shape) -->
            <v-group
              v-else-if="element.type === 'measurement-area'"
              :config="{
                id: element.id,
                x: getAreaLabelPosition(element).x,
                y: getAreaLabelPosition(element).y
              }"
              @click="handleElementClick(element, $event)"
              @dragstart="handleDragStart"
              @dragmove="handleDragMove"
              @dragend="handleDragEnd"
            >
              <v-text :config="getAreaLabelConfig(element)" />
            </v-group>
          </template>

          <!-- Current stroke being drawn -->
          <v-line
            v-if="currentStrokePoints.length > 0"
            :config="currentStrokeConfig"
          />

          <!-- Remote active strokes (in-progress drawings from other users) -->
          <v-line
            v-for="[strokeId, points] in Object.entries(activeStrokes || {})"
            :key="`active-${strokeId}`"
            :config="getActiveStrokeConfig(strokeId, points)"
          />

          <!-- Current arrow preview -->
          <v-arrow
            v-if="currentArrowPreview"
            :config="currentArrowPreview"
          />

          <!-- Current line preview -->
          <v-line
            v-if="currentLinePreview"
            :config="currentLinePreview"
          />

          <!-- Current shape preview -->
          <v-rect
            v-if="currentShapePreview?.type === 'rectangle'"
            :config="currentShapePreview.config"
          />
          <v-circle
            v-if="currentShapePreview?.type === 'circle'"
            :config="currentShapePreview.config"
          />
          <v-ellipse
            v-if="currentShapePreview?.type === 'ellipse'"
            :config="currentShapePreview.config"
          />

          <!-- Current polyline preview -->
          <v-line
            v-if="currentPolylinePreview"
            :config="currentPolylinePreview"
          />
          <!-- Polyline vertex markers -->
          <template v-if="polylineVertices.length > 0">
            <v-circle
              v-for="(vertex, idx) in polylineVertices"
              :key="`poly-vert-${idx}`"
              :config="{
                x: vertex.x,
                y: vertex.y,
                radius: 4,
                fill: idx === 0 ? '#22C55E' : '#3B82F6',
                stroke: '#FFFFFF',
                strokeWidth: 1,
                listening: false,
              }"
            />
          </template>

          <!-- Current arc preview -->
          <v-line
            v-if="currentArcPreview"
            :config="currentArcPreview"
          />
          <!-- Arc point markers -->
          <template v-if="arcClickState.length > 0">
            <v-circle
              v-for="(pt, idx) in arcClickState"
              :key="`arc-pt-${idx}`"
              :config="{
                x: pt[0],
                y: pt[1],
                radius: 5,
                fill: idx === 0 ? '#22C55E' : idx === 1 ? '#F59E0B' : '#3B82F6',
                stroke: '#FFFFFF',
                strokeWidth: 2,
                listening: false,
              }"
            />
          </template>

          <!-- Current revision cloud preview -->
          <v-line
            v-if="currentRevisionCloudPreview"
            :config="currentRevisionCloudPreview"
          />
          <!-- Revision cloud vertex markers -->
          <template v-if="revisionCloudVertices.length > 0">
            <v-circle
              v-for="(vertex, idx) in revisionCloudVertices"
              :key="`revcloud-vert-${idx}`"
              :config="{
                x: vertex.x,
                y: vertex.y,
                radius: 4,
                fill: idx === 0 ? '#22C55E' : '#3B82F6',
                stroke: '#FFFFFF',
                strokeWidth: 1,
                listening: false,
              }"
            />
          </template>

          <!-- Modification tool previews -->
          <!-- Offset preview -->
          <template v-if="currentTool === 'offset' && offsetPreview">
            <v-line
              v-if="offsetPreview.offsetEl.type === 'line'"
              :config="{
                points: [
                  ...(offsetPreview.offsetEl.data as any).start,
                  ...(offsetPreview.offsetEl.data as any).end,
                ],
                stroke: currentColor,
                strokeWidth: currentSize,
                dash: [6, 4],
                listening: false,
                opacity: 0.6,
              }"
            />
            <v-line
              v-if="offsetPreview.offsetEl.type === 'polyline'"
              :config="{
                points: (offsetPreview.offsetEl.data as any).points.flat(),
                stroke: currentColor,
                strokeWidth: currentSize,
                dash: [6, 4],
                listening: false,
                opacity: 0.6,
              }"
            />
          </template>

          <!-- Mirror preview elements -->
          <template v-if="currentTool === 'mirror' && mirrorPreviewElements.length > 0">
            <template v-for="mel in mirrorPreviewElements" :key="'mirror-' + mel.id">
              <v-line
                v-if="mel.type === 'line'"
                :config="{
                  points: [...(mel.data as any).start, ...(mel.data as any).end],
                  stroke: (mel.data as any).color,
                  strokeWidth: (mel.data as any).size,
                  dash: [6, 4],
                  listening: false,
                  opacity: 0.5,
                }"
              />
              <v-line
                v-if="mel.type === 'polyline'"
                :config="{
                  points: (mel.data as any).points.flat(),
                  stroke: (mel.data as any).color,
                  strokeWidth: (mel.data as any).size,
                  dash: [6, 4],
                  listening: false,
                  opacity: 0.5,
                }"
              />
            </template>
          </template>
          <!-- Mirror axis preview -->
          <v-line
            v-if="currentTool === 'mirror' && mirrorAxisFirst && mirrorAxisSecond"
            :config="{
              points: [mirrorAxisFirst.x, mirrorAxisFirst.y, mirrorAxisSecond.x, mirrorAxisSecond.y],
              stroke: '#F59E0B',
              strokeWidth: 1.5,
              dash: [8, 4],
              listening: false,
            }"
          />
          <v-circle
            v-if="currentTool === 'mirror' && mirrorAxisFirst"
            :config="{
              x: mirrorAxisFirst.x,
              y: mirrorAxisFirst.y,
              radius: 5,
              fill: '#F59E0B',
              stroke: '#FFFFFF',
              strokeWidth: 2,
              listening: false,
            }"
          />

          <!-- Rotate / Scale preview elements (shared style) -->
          <template v-if="(currentTool === 'rotate' || currentTool === 'scale') && transformPreviewElements.length > 0">
            <template v-for="tel in transformPreviewElements" :key="'transform-' + tel.id">
              <v-line
                v-if="tel.type === 'line'"
                :config="{
                  points: [...(tel.data as any).start, ...(tel.data as any).end],
                  stroke: (tel.data as any).color,
                  strokeWidth: (tel.data as any).size,
                  dash: [6, 4],
                  listening: false,
                  opacity: 0.5,
                }"
              />
              <v-line
                v-if="tel.type === 'polyline'"
                :config="{
                  points: (tel.data as any).points.flat(),
                  stroke: (tel.data as any).color,
                  strokeWidth: (tel.data as any).size,
                  dash: [6, 4],
                  closed: (tel.data as any).closed,
                  listening: false,
                  opacity: 0.5,
                }"
              />
              <v-line
                v-if="tel.type === 'arrow'"
                :config="{
                  points: (tel.data as any).points.flat(),
                  stroke: (tel.data as any).stroke,
                  strokeWidth: (tel.data as any).strokeWidth,
                  dash: [6, 4],
                  listening: false,
                  opacity: 0.5,
                }"
              />
              <v-rect
                v-if="tel.type === 'rectangle'"
                :config="{
                  x: (tel.data as any).x,
                  y: (tel.data as any).y,
                  width: (tel.data as any).width,
                  height: (tel.data as any).height,
                  stroke: (tel.data as any).stroke,
                  strokeWidth: (tel.data as any).strokeWidth,
                  dash: [6, 4],
                  listening: false,
                  opacity: 0.5,
                }"
              />
              <v-circle
                v-if="tel.type === 'circle'"
                :config="{
                  x: (tel.data as any).cx,
                  y: (tel.data as any).cy,
                  radius: (tel.data as any).radius,
                  stroke: (tel.data as any).stroke,
                  strokeWidth: (tel.data as any).strokeWidth,
                  dash: [6, 4],
                  listening: false,
                  opacity: 0.5,
                }"
              />
              <v-ellipse
                v-if="tel.type === 'ellipse'"
                :config="{
                  x: (tel.data as any).x,
                  y: (tel.data as any).y,
                  radiusX: (tel.data as any).radiusX,
                  radiusY: (tel.data as any).radiusY,
                  rotation: (tel.data as any).rotation || 0,
                  stroke: (tel.data as any).stroke,
                  strokeWidth: (tel.data as any).strokeWidth,
                  dash: [6, 4],
                  listening: false,
                  opacity: 0.5,
                }"
              />
            </template>
          </template>
          <!-- Rotate / Scale base point + radius guide + readout -->
          <v-line
            v-if="(currentTool === 'rotate' || currentTool === 'scale') && transformBasepoint && transformGuideEnd"
            :config="{
              points: [transformBasepoint.x, transformBasepoint.y, transformGuideEnd.x, transformGuideEnd.y],
              stroke: '#F59E0B',
              strokeWidth: 1.5,
              dash: [8, 4],
              listening: false,
            }"
          />
          <v-circle
            v-if="(currentTool === 'rotate' || currentTool === 'scale') && transformBasepoint"
            :config="{
              x: transformBasepoint.x,
              y: transformBasepoint.y,
              radius: 5,
              fill: '#F59E0B',
              stroke: '#FFFFFF',
              strokeWidth: 2,
              listening: false,
            }"
          />
          <v-text
            v-if="(currentTool === 'rotate' || currentTool === 'scale') && transformGuideEnd && transformReadout"
            :config="{
              text: transformReadout,
              x: transformGuideEnd.x + 10,
              y: transformGuideEnd.y - 22,
              fontSize: 14,
              fontStyle: 'bold',
              fill: '#F59E0B',
              fontFamily: 'Arial, sans-serif',
              listening: false,
            }"
          />

          <!-- Dimension tool preview -->
          <template v-if="currentTool === 'dimension' && dimensionToolState">
            <!-- First point marker -->
            <v-circle
              v-if="dimensionToolState.startPoint"
              :config="{
                x: dimensionToolState.startPoint[0],
                y: dimensionToolState.startPoint[1],
                radius: 4,
                fill: '#8B5CF6',
                stroke: '#FFFFFF',
                strokeWidth: 2,
                listening: false,
              }"
            />
            <!-- Line from start to cursor (step: end) or start to end (step: offset) -->
            <v-line
              v-if="dimensionToolState.startPoint && dimensionToolState.step === 'end' && dimensionToolState.currentPos"
              :config="{
                points: [dimensionToolState.startPoint[0], dimensionToolState.startPoint[1], dimensionToolState.currentPos.x, dimensionToolState.currentPos.y],
                stroke: '#8B5CF6',
                strokeWidth: 1,
                dash: [4, 4],
                listening: false,
              }"
            />
            <!-- Full dimension preview during offset step -->
            <template v-if="dimensionToolState.step === 'offset' && dimensionToolState.startPoint && dimensionToolState.endPoint">
              <template v-for="(cfg, idx) in getDimensionPreviewConfigs(dimensionToolState.startPoint, dimensionToolState.endPoint, dimensionToolState.previewOffset)" :key="'dim-preview-' + idx">
                <v-line :config="cfg" />
              </template>
            </template>
          </template>

          <!-- Current leader line preview for text annotation -->
          <v-line
            v-if="currentLeaderLinePreview"
            :config="currentLeaderLinePreview"
          />

          <!-- Current measurement distance preview -->
          <template v-if="isMeasuring && previewLine">
            <v-line :config="previewLine" />
            <v-circle
              v-if="measurementStart"
              :config="{
                x: measurementStart[0],
                y: measurementStart[1],
                radius: 5,
                fill: '#3B82F6',
                stroke: '#FFFFFF',
                strokeWidth: 2,
              }"
            />
            <v-circle
              v-if="currentMeasurementEnd"
              :config="{
                x: currentMeasurementEnd[0],
                y: currentMeasurementEnd[1],
                radius: 5,
                fill: '#3B82F6',
                stroke: '#FFFFFF',
                strokeWidth: 2,
              }"
            />
            <v-text
              v-if="previewLine.label"
              :config="{
                text: previewLine.label,
                x: (measurementStart![0] + currentMeasurementEnd![0]) / 2,
                y: (measurementStart![1] + currentMeasurementEnd![1]) / 2 - 20,
                fontSize: 14,
                fill: '#3B82F6',
                fontFamily: 'Arial, sans-serif',
              }"
            />
          </template>

          <!-- Snap indicator (different shapes per snap type) -->
          <!-- Endpoint: green square -->
          <v-rect
            v-if="currentSnapPoint && (currentSnapPoint.type === 'endpoint' || currentSnapPoint.type === 'corner')"
            :config="{
              x: currentSnapPoint.x - 5,
              y: currentSnapPoint.y - 5,
              width: 10,
              height: 10,
              fill: '#22C55E',
              stroke: '#15803D',
              strokeWidth: 1,
              listening: false,
            }"
          />
          <!-- Midpoint: orange triangle (rendered as small rotated rect) -->
          <v-regular-polygon
            v-if="currentSnapPoint && currentSnapPoint.type === 'midpoint'"
            :config="{
              x: currentSnapPoint.x,
              y: currentSnapPoint.y,
              sides: 3,
              radius: 6,
              fill: '#F97316',
              stroke: '#C2410C',
              strokeWidth: 1,
              listening: false,
            }"
          />
          <!-- Center: blue circle -->
          <v-circle
            v-if="currentSnapPoint && currentSnapPoint.type === 'center'"
            :config="{
              x: currentSnapPoint.x,
              y: currentSnapPoint.y,
              radius: 5,
              fill: 'transparent',
              stroke: '#3B82F6',
              strokeWidth: 2,
              listening: false,
            }"
          />
          <!-- Perpendicular: purple diamond -->
          <v-regular-polygon
            v-if="currentSnapPoint && currentSnapPoint.type === 'perpendicular'"
            :config="{
              x: currentSnapPoint.x,
              y: currentSnapPoint.y,
              sides: 4,
              radius: 6,
              fill: '#A855F7',
              stroke: '#7C3AED',
              strokeWidth: 1,
              rotation: 45,
              listening: false,
            }"
          />
          <!-- Tangent: cyan X shape -->
          <v-regular-polygon
            v-if="currentSnapPoint && currentSnapPoint.type === 'tangent'"
            :config="{
              x: currentSnapPoint.x,
              y: currentSnapPoint.y,
              sides: 4,
              radius: 6,
              fill: '#06B6D4',
              stroke: '#0891B2',
              strokeWidth: 1,
              rotation: 0,
              listening: false,
            }"
          />
          <!-- Nearest: amber dot -->
          <v-circle
            v-if="currentSnapPoint && currentSnapPoint.type === 'nearest'"
            :config="{
              x: currentSnapPoint.x,
              y: currentSnapPoint.y,
              radius: 4,
              fill: '#F59E0B',
              stroke: '#D97706',
              strokeWidth: 1,
              listening: false,
            }"
          />

          <!-- Polar tracking guide line -->
          <v-line
            v-if="polarTrackingResult?.snapped && isDrawing"
            :config="{
              points: getGuideLinePoints(polarTrackingResult),
              stroke: '#22D3EE',
              strokeWidth: 1,
              dash: [6, 4],
              listening: false,
            }"
          />
          <!-- Selection highlight for modify tools (rotate/scale/mirror) -->
          <template v-for="el in transformSelectedElements" :key="'hl-' + el.id">
            <v-line
              v-if="el.type === 'line'"
              :config="{
                points: [...(el.data as any).start, ...(el.data as any).end],
                stroke: '#06B6D4',
                strokeWidth: 4,
                dash: [8, 4],
                listening: false,
                lineCap: 'round',
                lineJoin: 'round',
                shadowColor: '#06B6D4',
                shadowBlur: 10,
                shadowOpacity: 0.5,
              }"
            />
            <v-rect
              v-else-if="el.type === 'rectangle'"
              :config="{
                x: (el.data as any).x,
                y: (el.data as any).y,
                width: (el.data as any).width,
                height: (el.data as any).height,
                stroke: '#06B6D4',
                strokeWidth: 4,
                dash: [8, 4],
                listening: false,
                fill: '#06B6D4',
                fillOpacity: 0.1,
                shadowColor: '#06B6D4',
                shadowBlur: 10,
                shadowOpacity: 0.5,
              }"
            />
            <v-circle
              v-else-if="el.type === 'circle'"
              :config="{
                x: (el.data as any).cx,
                y: (el.data as any).cy,
                radius: (el.data as any).radius,
                stroke: '#06B6D4',
                strokeWidth: 4,
                dash: [8, 4],
                listening: false,
                fill: '#06B6D4',
                fillOpacity: 0.1,
                shadowColor: '#06B6D4',
                shadowBlur: 10,
                shadowOpacity: 0.5,
              }"
            />
            <v-ellipse
              v-else-if="el.type === 'ellipse'"
              :config="{
                x: (el.data as any).x,
                y: (el.data as any).y,
                radiusX: (el.data as any).radiusX,
                radiusY: (el.data as any).radiusY,
                rotation: (el.data as any).rotation || 0,
                stroke: '#06B6D4',
                strokeWidth: 4,
                dash: [8, 4],
                listening: false,
                fill: '#06B6D4',
                fillOpacity: 0.1,
                shadowColor: '#06B6D4',
                shadowBlur: 10,
                shadowOpacity: 0.5,
              }"
            />
            <v-line
              v-else-if="el.type === 'polyline'"
              :config="{
                points: (el.data as any).points.flat(),
                stroke: '#06B6D4',
                strokeWidth: 4,
                dash: [8, 4],
                listening: false,
                lineCap: 'round',
                lineJoin: 'round',
                closed: (el.data as any).closed || false,
                shadowColor: '#06B6D4',
                shadowBlur: 10,
                shadowOpacity: 0.5,
              }"
            />
            <v-line
              v-else-if="el.type === 'arc'"
              :config="{
                points: getArcConfig(el).points,
                stroke: '#06B6D4',
                strokeWidth: 4,
                dash: [8, 4],
                listening: false,
                lineCap: 'round',
                lineJoin: 'round',
                shadowColor: '#06B6D4',
                shadowBlur: 10,
                shadowOpacity: 0.5,
              }"
            />
            <v-line
              v-else-if="el.type === 'revision-cloud'"
              :config="{
                points: getRevisionCloudConfig(el).points,
                stroke: '#06B6D4',
                strokeWidth: 4,
                dash: [8, 4],
                listening: false,
                lineCap: 'round',
                lineJoin: 'round',
                closed: true,
                shadowColor: '#06B6D4',
                shadowBlur: 10,
                shadowOpacity: 0.5,
              }"
            />
            <v-line
              v-else-if="el.type === 'arrow'"
              :config="{
                points: (el.data as any).points.flat(),
                stroke: '#06B6D4',
                strokeWidth: 4,
                dash: [8, 4],
                listening: false,
                lineCap: 'round',
                lineJoin: 'round',
                shadowColor: '#06B6D4',
                shadowBlur: 10,
                shadowOpacity: 0.5,
              }"
            />
          </template>
        </v-group>
      </v-layer>

      <!-- Transformer Layer (on top for selection handles) -->
      <v-layer ref="transformerLayerRef" name="transformerLayer">
        <v-transformer
          ref="transformerRef"
          :config="{
            anchorSize: 10,
            anchorStroke: '#3B82F6',
            anchorFill: '#FFFFFF',
            anchorCornerRadius: 2,
            borderStroke: '#3B82F6',
            borderDash: [4, 4],
            rotateAnchorOffset: 20,
          }"
        />
      </v-layer>
    </v-stage>

    <!-- Rotate / Scale step indicator -->
    <div
      v-if="transformHud"
      class="pointer-events-none fixed left-1/2 top-3 z-50 -translate-x-1/2 whitespace-nowrap rounded border border-chrome-border bg-chrome/90 px-3 py-1.5 font-mono text-xs text-yellow-300 shadow-lg"
    >
      {{ transformHud }}
    </div>

    <!-- Text annotation input dialog -->
    <div
      v-if="showAnnotationInput"
      class="fixed inset-0 bg-black/20 flex items-center justify-center z-50"
      @click.self="cancelAnnotation"
    >
      <div class="bg-white rounded-lg shadow-xl p-4 w-80">
        <h3 class="text-lg font-semibold mb-3">Add Annotation</h3>
        <textarea
          v-model="pendingAnnotationText"
          class="w-full border border-gray-300 rounded-md p-2 mb-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows="3"
          placeholder="Enter your annotation..."
          @keydown.enter.prevent="confirmAnnotation"
          @keydown.esc="cancelAnnotation"
        />
        <div class="flex justify-end gap-2">
          <button
            @click="cancelAnnotation"
            class="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
          >
            Cancel
          </button>
          <button
            @click="confirmAnnotation"
            class="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-md"
          >
            Add
          </button>
        </div>
      </div>
    </div>

    <!-- Collaborative cursors -->
    <ClientOnly>
      <template v-for="[clientId, cursorState] in remoteCursors" :key="clientId">
        <WhiteboardCursorPointer
          v-if="cursorState?.cursor"
          :viewport="viewport"
          :presence="{
            id: cursorState.user.id,
            name: cursorState.user.name,
            color: cursorState.user.color,
            cursor: cursorState.cursor,
            tool: cursorState.tool,
            lastSeen: cursorState.lastSeen,
          }"
        />
      </template>
    </ClientOnly>

    <!-- Measurement edit input dialog -->
    <div
      v-if="showMeasurementEditDialog"
      class="fixed inset-0 bg-black/20 flex items-center justify-center z-50"
      @click.self="cancelMeasurementEdit"
    >
      <div class="bg-white rounded-lg shadow-xl p-4 w-80">
        <h3 class="text-lg font-semibold mb-3">Edit Measurement</h3>
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-1">Measurement Value</label>
          <input
            v-model="pendingMeasurementValue"
            type="number"
            step="0.0001"
            class="w-full border border-gray-300 rounded-md p-2 mb-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter measurement value..."
            @keydown.enter.prevent="confirmMeasurementEdit"
            @keydown.esc="cancelMeasurementEdit"
          />
        </div>
        <div class="flex justify-end gap-2">
          <button
            @click="cancelMeasurementEdit"
            class="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
          >
            Cancel
          </button>
          <button
            @click="confirmMeasurementEdit"
            class="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-md"
          >
            Update
          </button>
        </div>
      </div>
    </div>

    <!-- PDF Loading Indicator -->
    <PDFLoadingIndicator
      :loading="pdfLoadingState.loading"
      :file-name="pdfFileName"
      :state="pdfLoadingState"
      :cancellable="pdfAbortController !== null"
      @cancel="cancelPDFLoad"
      @close="closeLoadingIndicator"
    />
  </div>
</template>

<script setup lang="ts">
import { getStroke } from 'perfect-freehand'
import type { CanvasElement, StrokeElement, LineElement, RectangleElement, CircleElement, EllipseElement, ImageElement, TextElement, TextAnnotationElement, ArrowElement, StampElement, MeasurementDistanceElement, MeasurementAreaElement, PolylineElement, ArcElement, FilletArcElement, DimensionElement, RevisionCloudElement, UserPresence, DocumentLayer } from '~/types'
import PDFLoadingIndicator from '~/components/whiteboard/PDFLoadingIndicator.vue'
import WhiteboardCursorPointer from '~/components/whiteboard/WhiteboardCursorPointer.vue'
import type { PDFLoadingState } from '~/types'
import { useSelection } from '~/composables/useSelection'
import { useViewport } from '~/composables/useViewport'
import { useCursors, type CursorState } from '~/composables/useCursors'
import { useMeasurements } from '~/composables/useMeasurements'
import { useSnapping } from '~/composables/useSnapping'
import { useOrthoMode } from '~/composables/useOrthoMode'
import { toastError } from '~/composables/useToast'
import { useToolHandlers, type ToolContext } from '~/composables/useToolHandlers'
import { usePolarTracking } from '~/composables/usePolarTracking'
import { useSelectTool } from '~/composables/tools/useSelectTool'
import { usePanTool } from '~/composables/tools/usePanTool'
import { usePenTool } from '~/composables/tools/usePenTool'
import { useHighlighterTool } from '~/composables/tools/useHighlighterTool'
import { useLineTool } from '~/composables/tools/useLineTool'
import { useArrowTool } from '~/composables/tools/useArrowTool'
import { useTextAnnotationTool } from '~/composables/tools/useTextAnnotationTool'
import { useRectangleTool } from '~/composables/tools/useRectangleTool'
import { useCircleTool } from '~/composables/tools/useCircleTool'
import { useEllipseTool } from '~/composables/tools/useEllipseTool'
import { useStampTool } from '~/composables/tools/useStampTool'
import { useEraserTool } from '~/composables/tools/useEraserTool'
import { useMeasureDistanceTool } from '~/composables/tools/useMeasureDistanceTool'
import { useMeasureAreaTool } from '~/composables/tools/useMeasureAreaTool'
import { usePolylineTool } from '~/composables/tools/usePolylineTool'
import { useArcTool } from '~/composables/tools/useArcTool'
import { useRevisionCloudTool, DEFAULT_REVISION_CLOUD_ARC_LENGTH } from '~/composables/tools/useRevisionCloudTool'
import { useOffsetTool } from '~/composables/tools/useOffsetTool'
import { useTrimTool } from '~/composables/tools/useTrimTool'
import { useExtendTool } from '~/composables/tools/useExtendTool'
import { useFilletTool } from '~/composables/tools/useFilletTool'
import { useMirrorTool } from '~/composables/tools/useMirrorTool'
import { useRotateTool } from '~/composables/tools/useRotateTool'
import { useScaleTool } from '~/composables/tools/useScaleTool'
import { useDimensionTool } from '~/composables/tools/useDimensionTool'
import { useGrid } from '~/composables/useGrid'
import { revisionCloudPath } from '~/utils/geometryUtils'

import type { StampType } from '~/composables/tools/useStampTool'

const props = defineProps<{
  whiteboardId: string
  userId: string
  userName: string
  elements: CanvasElement[]
  connectedUsers: Map<string, UserPresence>
  wsProvider: any  // WebSocket provider for Awareness API
  currentTool: string
  currentColor: string
  currentSize: number
  currentStampType?: StampType
  // Real-time stroke broadcasting props (optional - from useCollaborativeCanvas)
  activeStrokes?: Record<string, [number, number, number][]>
  startActiveStroke?: ((strokeId: string) => void) | null
  broadcastStrokePoint?: ((strokeId: string, point: [number, number, number]) => void) | null
  endActiveStroke?: ((strokeId: string, element: CanvasElement) => void) | null
  // Viewport sync props
  getViewport?: () => import('~/types').SharedViewportState
  syncViewport?: (viewport: import('~/types').ViewportState) => void
  observeViewport?: (callback: (viewport: import('~/types').SharedViewportState) => void) => () => void
  // Document layer sync props (for Yjs shared document layers)
  yDocumentLayers?: any  // Yjs Map containing shared document layers
  addDocumentLayer?: ((layer: any) => void) | null
  updateDocumentLayer?: ((id: string, updates: any) => void) | null
  removeDocumentLayer?: ((id: string) => void) | null
  // Layer visibility filtering
  hiddenLayerIds?: Set<string>
  activeLayerId?: string
}>()

const emit = defineEmits<{
  'element-add': [element: CanvasElement]
  'element-delete': [elementId: string]
  'element-update': [elementId: string, updates: Partial<CanvasElement>]
  'cursor-update': [x: number, y: number]
}>()

// Container ref
const containerRef = ref<HTMLDivElement | null>(null)
const stageRef = ref<any>(null)
const layerRef = ref<any>(null)
const transformerLayerRef = ref<any>(null)

// Document layer composable with Yjs sync
const {
  visibleLayers,
  addImageLayer,
  addPDFLayer,
  updateLayer,
  removeLayer,
} = useDocumentLayer({
  yDocumentLayers: props.yDocumentLayers,
  onAddLayer: props.addDocumentLayer || undefined,
  onUpdateLayer: props.updateDocumentLayer || undefined,
  onRemoveLayer: props.removeDocumentLayer || undefined,
})

// Default scale: 96 pixels per inch (standard screen resolution)
const pixelsPerInch = ref(96)

// Measurement composable
const yElementsProxy = {
  push: (elements: CanvasElement[]) => {
    // Forward to emit for now - parent handles yElements
    elements.forEach(el => emit('element-add', el))
  },
  toArray: () => props.elements,
}

const {
  isMeasuring,
  measurementStart,
  currentMeasurementEnd,
  previewLine,
  startDistanceMeasurement,
  updateMeasurementPreview,
  completeDistanceMeasurement,
  cancelMeasurement,
  measureArea,
  getMeasurementLabel,
  isMeasurementStale,
  getStaleMeasurements,
  updateMeasurementEndpoint,
  updateMeasurementValue,
  findAreaMeasurementsFor,
} = useMeasurements({
  yElements: yElementsProxy,
  userId: props.userId,
  userName: props.userName,
  pixelsPerInch,
})

// Snapping composable
const snapping = useSnapping({ threshold: 10 })
const { findSnapPoint } = snapping

// Selection composable
const {
  selectedId,
  hasSelection,
  transformerRef,
  selectElement,
  deselect,
  deleteSelected,
  selectElementAtPosition,
  handleStageClick,
} = useSelection(stageRef, computed(() => props.elements))

// Viewport composable
const {
  viewport,
  stageConfig: viewportStageConfig,
  handleWheel,
  isPanning,
  enablePan,
  disablePan,
  startPan,
  stopPan,
  setViewportDirect,
  applyRemoteViewport,
  getViewportBounds,
} = useViewport({
  stageRef,
  containerRef,
  minZoom: 0.1,
  maxZoom: 5.0,
  userId: props.userId,
  syncViewport: props.syncViewport,
  applyRemoteViewport: undefined, // We'll handle this via observer callback
})

// Cursor tracking composable with Awareness API
const {
  currentUser,
  remoteCursors,
  updateLocalCursor,
  cleanup: cleanupCursors,
} = useCursors(props.wsProvider, props.userId, props.userName)

// Stage configuration (merges viewport config with width/height)
const stageConfig = computed(() => {
  const config: any = {
    width: stageWidth.value,
    height: stageHeight.value,
    scaleX: viewportStageConfig.value.scaleX,
    scaleY: viewportStageConfig.value.scaleY,
    x: viewportStageConfig.value.x,
    y: viewportStageConfig.value.y,
    // Fix for Konva hit detection bug when panned/zoomed
    // Disable pixel-perfect hit detection to avoid getImageData errors
    // when viewport is panned/zoomed to extreme positions
    hitGraphEnabled: true,
    listening: true,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
  }

  return config
})

// Stage width/height (separate from viewport config)
const stageWidth = ref(2000)
const stageHeight = ref(1500)

// Layer image cache to prevent reloading - use plain Map (non-reactive)
// to avoid triggering re-renders when cache is updated
const layerImageCache = new Map<string, HTMLImageElement>()
const elementImageCache = new Map<string, HTMLImageElement>()

function getLayerImage(src: string): HTMLImageElement | null {
  if (layerImageCache.has(src)) {
    return layerImageCache.get(src)!
  }
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = src
  layerImageCache.set(src, img)
  return img
}

// Pre-load layer images when layers change to avoid render-time loading
watch(visibleLayers, (layers) => {
  for (const layer of layers) {
    if (layer.src && !layerImageCache.has(layer.src)) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = layer.src
      layerImageCache.set(layer.src, img)
    }
  }
}, { deep: true })

// Bounding box cache for viewport clipping - use plain Map (non-reactive)
// to avoid triggering re-renders when cache is updated
const boundingBoxCache = new Map<string, { left: number; right: number; top: number; bottom: number }>()

/**
 * Get bounding box for an element in canvas coordinates
 * Returns { left, right, top, bottom } with padding for stroke width
 */
function getElementBoundingBox(element: CanvasElement): { left: number; right: number; top: number; bottom: number } {
  // Check cache first
  if (boundingBoxCache.has(element.id)) {
    return boundingBoxCache.get(element.id)!
  }

  let bbox: { left: number; right: number; top: number; bottom: number }

  switch (element.type) {
    case 'stroke': {
      const data = element.data as StrokeElement
      const points = data.points
      if (points.length === 0) {
        bbox = { left: 0, right: 0, top: 0, bottom: 0 }
      } else {
        const first = points[0]!
        let minX = first[0], maxX = first[0]
        let minY = first[1], maxY = first[1]
        for (let i = 1; i < points.length; i++) {
          const p = points[i]!
          minX = Math.min(minX, p[0])
          maxX = Math.max(maxX, p[0])
          minY = Math.min(minY, p[1])
          maxY = Math.max(maxY, p[1])
        }
        // Add padding for stroke width
        const padding = data.size / 2 + 10
        bbox = {
          left: minX - padding,
          right: maxX + padding,
          top: minY - padding,
          bottom: maxY + padding,
        }
      }
      break
    }

    case 'line': {
      const data = element.data as LineElement
      const minX = Math.min(data.start[0], data.end[0])
      const maxX = Math.max(data.start[0], data.end[0])
      const minY = Math.min(data.start[1], data.end[1])
      const maxY = Math.max(data.start[1], data.end[1])
      const padding = data.size / 2 + 10
      bbox = {
        left: minX - padding,
        right: maxX + padding,
        top: minY - padding,
        bottom: maxY + padding,
      }
      break
    }

    case 'arrow': {
      const data = element.data as ArrowElement
      const points = data.points
      if (points.length < 2) {
        bbox = { left: 0, right: 0, top: 0, bottom: 0 }
      } else {
        const first = points[0]!
        let minX = first[0], maxX = first[0]
        let minY = first[1], maxY = first[1]
        for (let i = 1; i < points.length; i++) {
          const p = points[i]!
          minX = Math.min(minX, p[0])
          maxX = Math.max(maxX, p[0])
          minY = Math.min(minY, p[1])
          maxY = Math.max(maxY, p[1])
        }
        // Add padding for arrowhead and stroke
        const padding = Math.max(data.pointerLength, data.strokeWidth) + 10
        bbox = {
          left: minX - padding,
          right: maxX + padding,
          top: minY - padding,
          bottom: maxY + padding,
        }
      }
      break
    }

    case 'rectangle': {
      const data = element.data as RectangleElement
      const padding = data.strokeWidth / 2 + 10
      bbox = {
        left: data.x - padding,
        right: data.x + data.width + padding,
        top: data.y - padding,
        bottom: data.y + data.height + padding,
      }
      break
    }

    case 'circle': {
      const data = element.data as CircleElement
      const padding = data.strokeWidth / 2 + 10
      bbox = {
        left: data.cx - data.radius - padding,
        right: data.cx + data.radius + padding,
        top: data.cy - data.radius - padding,
        bottom: data.cy + data.radius + padding,
      }
      break
    }

    case 'ellipse': {
      const data = element.data as EllipseElement
      const padding = data.strokeWidth / 2 + 10
      bbox = {
        left: data.x - data.radiusX - padding,
        right: data.x + data.radiusX + padding,
        top: data.y - data.radiusY - padding,
        bottom: data.y + data.radiusY + padding,
      }
      break
    }

    case 'polyline': {
      const data = element.data as PolylineElement
      if (data.points.length === 0) {
        bbox = { left: 0, right: 0, top: 0, bottom: 0 }
      } else {
        const first = data.points[0]!
        let minX = first[0], maxX = first[0]
        let minY = first[1], maxY = first[1]
        for (let i = 1; i < data.points.length; i++) {
          const p = data.points[i]!
          minX = Math.min(minX, p[0])
          maxX = Math.max(maxX, p[0])
          minY = Math.min(minY, p[1])
          maxY = Math.max(maxY, p[1])
        }
        const padding = data.size / 2 + 10
        bbox = {
          left: minX - padding,
          right: maxX + padding,
          top: minY - padding,
          bottom: maxY + padding,
        }
      }
      break
    }

    case 'arc': {
      const data = element.data as ArcElement
      const allPoints = [data.start, data.through, data.end]
      const first = allPoints[0]!
      let minX = first[0], maxX = first[0]
      let minY = first[1], maxY = first[1]
      for (let i = 1; i < allPoints.length; i++) {
        const p = allPoints[i]!
        minX = Math.min(minX, p[0])
        maxX = Math.max(maxX, p[0])
        minY = Math.min(minY, p[1])
        maxY = Math.max(maxY, p[1])
      }
      const padding = data.size / 2 + 10
      bbox = {
        left: minX - padding,
        right: maxX + padding,
        top: minY - padding,
        bottom: maxY + padding,
      }
      break
    }

    case 'revision-cloud': {
      const data = element.data as RevisionCloudElement
      if (data.points.length === 0) {
        bbox = { left: 0, right: 0, top: 0, bottom: 0 }
      } else {
        const first = data.points[0]!
        let minX = first[0], maxX = first[0]
        let minY = first[1], maxY = first[1]
        for (let i = 1; i < data.points.length; i++) {
          const p = data.points[i]!
          minX = Math.min(minX, p[0])
          maxX = Math.max(maxX, p[0])
          minY = Math.min(minY, p[1])
          maxY = Math.max(maxY, p[1])
        }
        // Arc lobes bulge outward ~ arcLength/2 beyond the vertices
        const padding = data.size / 2 + data.arcLength / 2 + 10
        bbox = {
          left: minX - padding,
          right: maxX + padding,
          top: minY - padding,
          bottom: maxY + padding,
        }
      }
      break
    }

    case 'image': {
      const data = element.data as ImageElement
      bbox = {
        left: data.x,
        right: data.x + data.width,
        top: data.y,
        bottom: data.y + data.height,
      }
      break
    }

    case 'text': {
      const data = element.data as TextElement
      // Estimate text dimensions (rough approximation)
      const charWidth = data.fontSize * 0.6
      const width = data.text.length * charWidth
      const height = data.fontSize
      bbox = {
        left: data.x,
        right: data.x + width,
        top: data.y - height,  // Text draws from baseline
        bottom: data.y,
      }
      break
    }

    case 'stamp': {
      const data = element.data as StampElement
      const padding = 10 // border/shadow
      bbox = {
        left: data.x - padding,
        right: data.x + data.width + padding,
        top: data.y - padding,
        bottom: data.y + data.height + padding,
      }
      break
    }

    case 'text-annotation': {
      const data = element.data as TextAnnotationElement
      const minX = Math.min(data.leaderLine.start[0], data.leaderLine.end[0])
      const maxX = Math.max(data.leaderLine.start[0], data.leaderLine.end[0])
      const minY = Math.min(data.leaderLine.start[1], data.leaderLine.end[1])
      const maxY = Math.max(data.leaderLine.start[1], data.leaderLine.end[1])
      // Account for text at leader line end
      const charWidth = data.fontSize * 0.6
      const textWidth = data.text.length * charWidth
      const textHeight = data.fontSize + 20
      bbox = {
        left: Math.min(minX, data.leaderLine.end[0] - textWidth / 2) - 10,
        right: Math.max(maxX, data.leaderLine.end[0] + textWidth / 2) + 10,
        top: Math.min(minY, data.leaderLine.end[1] - textHeight) - 10,
        bottom: Math.max(maxY, data.leaderLine.end[1] + 20) + 10,
      }
      break
    }

    case 'measurement-distance': {
      const data = element.data as MeasurementDistanceElement
      const minX = Math.min(data.start[0], data.end[0])
      const maxX = Math.max(data.start[0], data.end[0])
      const minY = Math.min(data.start[1], data.end[1])
      const maxY = Math.max(data.start[1], data.end[1])
      // Account for anchors and label
      const padding = 30 // label + anchors
      bbox = {
        left: minX - padding,
        right: maxX + padding,
        top: minY - padding,
        bottom: maxY + padding,
      }
      break
    }

    case 'measurement-area': {
      const data = element.data as MeasurementAreaElement
      // Find the target element to get its bounds
      const target = props.elements.find(el => el.id === data.targetElementId)
      if (target) {
        bbox = getElementBoundingBox(target)
        // Expand slightly for the label
        const labelPadding = 30
        bbox = {
          left: bbox.left,
          right: bbox.right,
          top: bbox.top - labelPadding,
          bottom: bbox.bottom,
        }
      } else {
        bbox = { left: 0, right: 0, top: 0, bottom: 0 }
      }
      break
    }

    case 'dimension': {
      const data = element.data as DimensionElement
      const allX = [data.start[0], data.end[0]]
      const allY = [data.start[1], data.end[1]]
      // Include offset dimension line position
      const dx = data.end[0] - data.start[0]
      const dy = data.end[1] - data.start[1]
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len > 0) {
        const nx = -dy / len
        const ny = dx / len
        allX.push(data.start[0] + nx * data.offset)
        allX.push(data.end[0] + nx * data.offset)
        allY.push(data.start[1] + ny * data.offset)
        allY.push(data.end[1] + ny * data.offset)
      }
      const padding = 30
      bbox = {
        left: Math.min(...allX) - padding,
        right: Math.max(...allX) + padding,
        top: Math.min(...allY) - padding,
        bottom: Math.max(...allY) + padding,
      }
      break
    }

    default:
      bbox = { left: 0, right: 0, top: 0, bottom: 0 }
  }

  // Cache the result
  boundingBoxCache.set(element.id, bbox)
  return bbox
}

/**
 * Check if an element's bounding box intersects with viewport bounds
 */
function isElementInViewport(
  element: CanvasElement,
  viewportBounds: { left: number; right: number; top: number; bottom: number }
): boolean {
  const bbox = getElementBoundingBox(element)

  // Check for intersection - element is visible if NOT completely outside
  return !(
    bbox.right < viewportBounds.left ||
    bbox.left > viewportBounds.right ||
    bbox.bottom < viewportBounds.top ||
    bbox.top > viewportBounds.bottom
  )
}

/**
 * Computed property for visible elements with viewport clipping
 * Only filters when element count >= 500 for performance
 */
const visibleElements = computed(() => {
  let filtered = props.elements

  // Filter out elements on hidden layers
  if (props.hiddenLayerIds && props.hiddenLayerIds.size > 0) {
    filtered = filtered.filter(el => !props.hiddenLayerIds!.has(el.layerId || 'default'))
  }

  // If we have fewer than 500 elements, return all (no viewport culling needed)
  if (filtered.length < 500) {
    return filtered
  }

  // Get viewport bounds for culling
  const bounds = getViewportBounds(stageWidth.value, stageHeight.value)

  // Filter elements that intersect with viewport
  return filtered.filter(element => isElementInViewport(element, bounds))
})

// Watch elements changes to clear bounding box cache
watch(() => props.elements, (newElements, oldElements) => {
  // Clear cache when elements are added/removed
  // We could be smarter and only invalidate changed elements, but full clear is simpler
  const newIds = new Set(newElements.map(el => el.id))
  const oldIds = new Set(oldElements?.map(el => el.id) || [])

  // Remove cache entries for deleted elements
  for (const id of boundingBoxCache.keys()) {
    if (!newIds.has(id)) {
      boundingBoxCache.delete(id)
    }
  }

  // Invalidate cache for modified elements by checking if element data changed
  for (const newEl of newElements) {
    const oldEl = oldElements?.find(el => el.id === newEl.id)
    if (oldEl && JSON.stringify(oldEl.data) !== JSON.stringify(newEl.data)) {
      boundingBoxCache.delete(newEl.id)
    }
  }
}, { deep: true })

// Drawing state
const isDrawing = ref(false)
const currentPressure = ref(0.5)
const currentPointerType = ref<'mouse' | 'pen' | 'touch'>('mouse')

// Gesture state for two-finger pan using pointer events
const activePointers = ref<Map<number, {x: number, y: number}>>(new Map())
const gestureState = ref({
  isPanning: false,
  lastViewport: { x: 0, y: 0, zoom: 1 },
})

// Manual pan tool state
const panStartPointer = ref<{x: number, y: number} | null>(null)
const panStartViewport = ref<{x: number, y: number} | null>(null)
const isPanToolActive = ref(false)
const currentSnapPoint = ref<{x: number, y: number, type?: string} | null>(null)

// Fillet radius — configurable via the command line (e.g. type a number while
// the fillet tool is active).
const filletRadius = ref(20)

// Polar tracking
const polarTracking = usePolarTracking()
const polarTrackingResult = ref<{ point: { x: number; y: number }; angle: number; snapped: boolean } | null>(null)

// Grid composable
const grid = useGrid()
const gridLines = computed(() =>
  grid.getVisibleGridLines(viewport.value, stageWidth.value, stageHeight.value)
)

// Unified constraint pipeline: ortho mode (polar tracking is handled at tool level)
// Exposed to parent via props/events for ortho toggle
const orthoMode = useOrthoMode()
const orthoEnabled = orthoMode.isOrthoEnabled

/**
 * Unified constraint pipeline applied in priority order:
 * 1. Ortho (H/V lock)
 * 2. Polar tracking (angle snap)
 * Ortho takes priority; polar is applied when ortho is off.
 */
function constrainPoint(origin: { x: number; y: number }, cursor: { x: number; y: number }): { x: number; y: number } {
  // Ortho first
  if (orthoEnabled.value) {
    const orthoResult = orthoMode.constrainPoint(origin, cursor)
    polarTrackingResult.value = null
    return orthoResult
  }

  // Polar tracking
  if (polarTracking.isPolarEnabled.value) {
    const result = polarTracking.constrainPoint(origin, cursor)
    polarTrackingResult.value = result
    return result.point
  }

  polarTrackingResult.value = null

  // Grid snap (lowest priority)
  if (grid.gridSnapEnabled.value) {
    return grid.snapToGrid(cursor, viewport.value)
  }

  return cursor
}

// Tool handler registry
const toolRegistry = useToolHandlers()

// Create tool context (shared by all tools)
const toolContext: ToolContext = {
  get userId() { return props.userId },
  get userName() { return props.userName },
  get currentTool() { return props.currentTool as any },
  get currentColor() { return props.currentColor },
  get currentSize() { return props.currentSize },
  get currentStampType() { return props.currentStampType },
  get elements() { return props.elements },
  isDrawing,
  viewport,
  stageRef,
  layerRef,
  currentPressure,
  currentPointerType,
  filletRadius,
  getPointerPos,
  getStagePointerPos,
  emitElementAdd: (el) => {
    const layerId = props.activeLayerId || 'default'
    if (layerId !== 'default' || el.layerId) {
      emit('element-add', { ...el, layerId })
    } else {
      emit('element-add', el)
    }
  },
  emitElementDelete: (id) => emit('element-delete', id),
  emitElementUpdate: (id, updates) => emit('element-update', id, updates),
  emitCursorUpdate: (x, y) => emit('cursor-update', x, y),
  currentSnapPoint,
  findSnapPoint: (pos, elements) => {
    const snap = findSnapPoint(pos, elements)
    return snap ? { x: snap.x, y: snap.y, type: snap.type } : null
  },
  constrainPoint,
  polarTrackingResult,
  applyDirectDistance: (dist: number) => {
    // Find the active drawing tool's start point
    const origin = lineStart.value || arrowStart.value || shapeStart.value
    if (!origin || !isDrawing.value) return false

    // Determine the current angle from the last cursor movement
    const currentEnd = currentLineEnd.value || currentArrowEnd.value || currentShapeEnd.value
    if (!currentEnd) return false

    let angle = Math.atan2(currentEnd.y - origin.y, currentEnd.x - origin.x)

    // Apply ortho: snap to nearest cardinal
    if (orthoEnabled.value) {
      const dx = currentEnd.x - origin.x
      const dy = currentEnd.y - origin.y
      if (Math.abs(dx) >= Math.abs(dy)) {
        angle = dx >= 0 ? 0 : Math.PI
      } else {
        angle = dy >= 0 ? Math.PI / 2 : -Math.PI / 2
      }
    }

    // Calculate endpoint at distance along angle
    const endpoint = {
      x: origin.x + dist * Math.cos(angle),
      y: origin.y + dist * Math.sin(angle),
    }

    // Dispatch mouseup with the calculated endpoint to complete the drawing
    toolRegistry.dispatchMouseUp(props.currentTool as any, null, endpoint)
    return true
  },
  setCursor(cursor: string) {
    const stage = stageRef.value?.getNode()
    const container = stage?.container()
    if (container) container.style.setProperty('cursor', cursor)
  },
  clearCursor() {
    const stage = stageRef.value?.getNode()
    const container = stage?.container()
    if (container) container.style.removeProperty('cursor')
  },
  get activeStrokes() { return props.activeStrokes },
  get startActiveStroke() { return props.startActiveStroke },
  get broadcastStrokePoint() { return props.broadcastStrokePoint },
  get endActiveStroke() { return props.endActiveStroke },
  isMeasuring,
  measurementStart,
  currentMeasurementEnd,
  previewLine,
  startDistanceMeasurement,
  updateMeasurementPreview,
  completeDistanceMeasurement,
  cancelMeasurement,
  measureArea,
  selectedId,
  selectElementAtPosition,
  isPanning,
  enablePan,
  disablePan,
  setViewportDirect,
  panStartPointer,
  panStartViewport,
  get activeLayerId() { return props.activeLayerId || 'default' },
}

// Instantiate all tool handlers
const selectTool = useSelectTool(toolContext)
const panToolHandler = usePanTool(toolContext)
const penTool = usePenTool(toolContext)
const highlighterTool = useHighlighterTool(toolContext)
const lineTool = useLineTool(toolContext)
const arrowTool = useArrowTool(toolContext)
const textAnnotationTool = useTextAnnotationTool(toolContext)
const rectangleTool = useRectangleTool(toolContext)
const circleTool = useCircleTool(toolContext)
const ellipseTool = useEllipseTool(toolContext)
const stampTool = useStampTool(toolContext)
const eraserTool = useEraserTool(toolContext)
const measureDistanceTool = useMeasureDistanceTool(toolContext)
const measureAreaTool = useMeasureAreaTool(toolContext)
const polylineTool = usePolylineTool(toolContext)
const arcTool = useArcTool(toolContext)
const revisionCloudTool = useRevisionCloudTool(toolContext)
const offsetTool = useOffsetTool(toolContext)
const trimTool = useTrimTool(toolContext)
const extendTool = useExtendTool(toolContext)
const filletTool = useFilletTool(toolContext)
const mirrorTool = useMirrorTool(toolContext)
const rotateTool = useRotateTool(toolContext)
const scaleTool = useScaleTool(toolContext)
const dimensionTool = useDimensionTool(toolContext)

// Register all tools
toolRegistry.register('select', selectTool)
toolRegistry.register('pan', panToolHandler)
toolRegistry.register('pen', penTool)
toolRegistry.register('highlighter', highlighterTool)
toolRegistry.register('line', lineTool)
toolRegistry.register('arrow', arrowTool)
toolRegistry.register('text-annotation', textAnnotationTool)
toolRegistry.register('rectangle', rectangleTool)
toolRegistry.register('circle', circleTool)
toolRegistry.register('ellipse', ellipseTool)
toolRegistry.register('stamp', stampTool)
toolRegistry.register('eraser', eraserTool)
toolRegistry.register('measure-distance', measureDistanceTool)
toolRegistry.register('measure-area', measureAreaTool)
toolRegistry.register('polyline', polylineTool)
toolRegistry.register('arc', arcTool)
toolRegistry.register('revision-cloud', revisionCloudTool)
toolRegistry.register('offset', offsetTool)
toolRegistry.register('trim', trimTool)
toolRegistry.register('extend', extendTool)
toolRegistry.register('fillet', filletTool)
toolRegistry.register('mirror', mirrorTool)
toolRegistry.register('rotate', rotateTool)
toolRegistry.register('scale', scaleTool)
toolRegistry.register('dimension', dimensionTool)

// Expose tool state for template rendering
const currentStrokePoints = penTool.state!.currentStrokePoints
const currentStrokeId = penTool.state!.currentStrokeId
const arrowStart = arrowTool.state!.arrowStart
const currentArrowEnd = arrowTool.state!.currentArrowEnd
const lineStart = lineTool.state!.lineStart
const currentLineEnd = lineTool.state!.currentLineEnd
const shapeStart = rectangleTool.state!.shapeStart
const currentShapeEnd = rectangleTool.state!.currentShapeEnd
const textAnnotationStart = textAnnotationTool.state!.textAnnotationStart
const currentLeaderLineEnd = textAnnotationTool.state!.currentLeaderLineEnd
const showAnnotationInput = textAnnotationTool.state!.showAnnotationInput
const pendingAnnotationText = textAnnotationTool.state!.pendingAnnotationText
const annotationInputPosition = textAnnotationTool.state!.annotationInputPosition
const confirmAnnotation = textAnnotationTool.state!.confirmAnnotation
const cancelAnnotation = textAnnotationTool.state!.cancelAnnotation

// Polyline tool state
const polylineVertices = polylineTool.state!.vertices
const polylineCurrentVertex = polylineTool.state!.currentVertex
const polylineIsDrawing = polylineTool.state!.isDrawing

// Arc tool state
const arcClickState = arcTool.state!.clickPoints
const arcCurrentCursor = arcTool.state!.currentCursor
const arcIsDrawing = arcTool.state!.isDrawing

// Revision cloud tool state
const revisionCloudVertices = revisionCloudTool.state!.vertices
const revisionCloudCurrentVertex = revisionCloudTool.state!.currentVertex
const revisionCloudIsDrawing = revisionCloudTool.state!.isDrawing

// Modification tool state
const offsetPreview = offsetTool.state!.previewResult
const trimHighlightId = trimTool.state!.highlightId
const trimCuttingEdgeId = trimTool.state!.cuttingEdgeId
const trimStep = trimTool.state!.step
const extendHighlightId = extendTool.state!.highlightId
const extendBoundaryId = extendTool.state!.boundaryId
const extendStep = extendTool.state!.step
const filletHighlightId = filletTool.state!.highlightId
const filletFirstLineId = filletTool.state!.firstLineId
const filletStep = filletTool.state!.step
const mirrorSelectedIds = mirrorTool.state!.selectedIds
const mirrorAxisFirst = mirrorTool.state!.axisFirst
const mirrorAxisSecond = mirrorTool.state!.axisSecond
const mirrorPreviewElements = mirrorTool.state!.previewElements
const mirrorStep = mirrorTool.state!.step
const rotateSelectedIds = rotateTool.state!.selectedIds
const rotateBasepoint = rotateTool.state!.basepoint
const rotateCurrentCursor = rotateTool.state!.currentCursor
const rotateCurrentAngle = rotateTool.state!.currentAngle
const rotatePreviewElements = rotateTool.state!.previewElements
const rotateStep = rotateTool.state!.step
const scaleSelectedIds = scaleTool.state!.selectedIds
const scaleBasepoint = scaleTool.state!.basepoint
const scaleCurrentCursor = scaleTool.state!.currentCursor
const scaleCurrentScale = scaleTool.state!.currentScale
const scalePreviewElements = scaleTool.state!.previewElements
const scaleStep = scaleTool.state!.step

// Rotate / Scale share a preview style; pick the active tool's preview set.
const transformPreviewElements = computed(() => {
  if (props.currentTool === 'rotate') return rotatePreviewElements.value
  if (props.currentTool === 'scale') return scalePreviewElements.value
  return []
})
const transformBasepoint = computed(() => {
  if (props.currentTool === 'rotate') return rotateBasepoint.value
  if (props.currentTool === 'scale') return scaleBasepoint.value
  return null
})
const transformGuideEnd = computed(() => {
  if (props.currentTool === 'rotate') return rotateCurrentCursor.value
  if (props.currentTool === 'scale') return scaleCurrentCursor.value
  return null
})
const transformReadout = computed(() => {
  if (props.currentTool === 'rotate') {
    return `${Math.round((rotateCurrentAngle.value * 180) / Math.PI)}°`
  }
  if (props.currentTool === 'scale') {
    return `${scaleCurrentScale.value.toFixed(2)}×`
  }
  return ''
})

// Step indicator for Rotate/Scale — makes the multi-step flow visible (these
// tools otherwise render no selection highlight) and doubles as a diagnostic:
// the selection count confirms whether a click registered, and the step name
// confirms whether Enter advanced the state machine.
const transformHud = computed(() => {
  if (props.currentTool !== 'rotate' && props.currentTool !== 'scale') return ''
  const which = props.currentTool === 'rotate' ? 'ROTATE' : 'SCALE'
  const sel = (props.currentTool === 'rotate' ? rotateSelectedIds.value : scaleSelectedIds.value).length
  const step = props.currentTool === 'rotate' ? rotateStep.value : scaleStep.value
  if (step === 'select') return `${which} — click shapes to select (${sel} selected), then press Enter`
  if (step === 'basepoint') return `${which} — click the base point (pivot)`
  return `${which} — ${transformReadout.value} — click to commit  (Esc to back out)`
})

// Selection highlight for modify tools (rotate/scale/mirror)
const transformSelectedIds = computed(() => {
  if (props.currentTool === 'rotate') return rotateSelectedIds.value
  if (props.currentTool === 'scale') return scaleSelectedIds.value
  if (props.currentTool === 'mirror') return mirrorSelectedIds.value
  return []
})

const transformSelectedElements = computed(() => {
  const ids = transformSelectedIds.value
  return props.elements.filter((el: CanvasElement) => ids.includes(el.id))
})

// Dimension tool state
const dimensionToolState = dimensionTool.state

// Measurement edit dialog state
const showMeasurementEditDialog = ref(false)
const editingMeasurementElement = ref<CanvasElement | null>(null)
const pendingMeasurementValue = ref('')

// PDF loading state
const pdfLoadingState = ref<PDFLoadingState>({
  loading: false,
  loaded: 0,
  total: 100,
  percent: 0,
})
const pdfFileName = ref<string>('')
const pdfAbortController = ref<AbortController | null>(null)

// Viewport observer cleanup function
let cleanupViewportObserver: (() => void) | null = null

// Initialize stage size
onMounted(() => {
  if (containerRef.value) {
    stageWidth.value = containerRef.value.offsetWidth || 2000
    stageHeight.value = containerRef.value.offsetHeight || 1500
  }

  // Handle window resize
  window.addEventListener('resize', handleResize)

  // Add keyboard shortcuts for selection
  window.addEventListener('keydown', handleKeyDown)

  // Set up viewport sync if functions provided
  if (props.observeViewport && props.getViewport) {
    // Load initial viewport from shared state
    const initialViewport = props.getViewport()
    if (initialViewport.lastUpdatedBy && initialViewport.lastUpdatedBy !== props.userId) {
      // Apply remote viewport if it exists and is from another user
      if (applyRemoteViewport) {
        applyRemoteViewport({
          x: initialViewport.x,
          y: initialViewport.y,
          zoom: initialViewport.zoom,
        })
      }
    }

    // Set up observer for remote viewport changes
    cleanupViewportObserver = props.observeViewport((remoteViewport) => {
      // Apply remote viewport change
      if (applyRemoteViewport) {
        applyRemoteViewport({
          x: remoteViewport.x,
          y: remoteViewport.y,
          zoom: remoteViewport.zoom,
        })
      }
    })
  }
})

onUnmounted(() => {
  layerImageCache.clear()
  boundingBoxCache.clear()  // Clear bounding box cache
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('keydown', handleKeyDown)

  // Clean up viewport observer
  if (cleanupViewportObserver) {
    cleanupViewportObserver()
    cleanupViewportObserver = null
  }

  // Clean up cursor tracking via Awareness
  cleanupCursors()
})

function handleResize() {
  if (containerRef.value) {
    stageWidth.value = containerRef.value.offsetWidth || 2000
    stageHeight.value = containerRef.value.offsetHeight || 1500
  }
}

/**
 * Handle keyboard shortcuts for selection and tools
 */
function handleKeyDown(event: KeyboardEvent) {
  // Don't trigger shortcuts if typing in input/textarea
  if (document.activeElement?.tagName === 'INPUT' ||
      document.activeElement?.tagName === 'TEXTAREA' ||
      document.activeElement?.getAttribute('contenteditable') === 'true') {
    return
  }

  // Route to the active tool FIRST. Multi-step tools (polyline, arc, revision
  // cloud, mirror, offset, trim, extend, fillet, dimension) handle Enter,
  // Backspace, Escape and letter keys (e.g. polyline 'c' to close) here. This
  // listener is registered before the page-level shortcut handler (child mounts
  // before parent), so when a tool consumes the event we stopImmediatePropagation
  // to keep the page handler from switching tools or firing global Escape/Delete.
  if (toolRegistry.dispatchKeyDown(props.currentTool as any, event)) {
    event.preventDefault()
    event.stopImmediatePropagation()
    return
  }

  // Delete/Backspace - remove selected element
  if ((event.key === 'Delete' || event.key === 'Backspace') && hasSelection.value) {
    // Don't delete if user is typing in an input
    if (document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.getAttribute('contenteditable') !== 'true') {
      event.preventDefault()
      const id = deleteSelected()
      if (id) {
        emit('element-delete', id)

        // Also clean up any area measurements linked to this element
        const areaMeasurementIds = findAreaMeasurementsFor(id)
        areaMeasurementIds.forEach((areaId: string) => emit('element-delete', areaId))
      }
    }
  }

  // Escape - deselect
  if (event.key === 'Escape' && hasSelection.value) {
    event.preventDefault()
    deselect()
  }
}

// Get stage position from mouse/touch/pointer event
// Returns canvas coordinates accounting for viewport (pan/zoom)
function getPointerPos(event: any) {
  const stage = stageRef.value?.getNode()
  if (!stage) return { x: 0, y: 0 }

  const pos = stage.getPointerPosition()
  if (!pos) return { x: 0, y: 0 }

  // Konva's getPointerPosition() returns coordinates relative to the stage's top-left corner.
  // But the stage CONTENT is offset by viewport.x/y (pan position).
  // To get canvas coordinates (where elements should be placed), we need to:
  // 1. Start with pointer position in stage space
  // 2. Subtract the viewport pan offset
  // 3. Divide by zoom
  return {
    x: (pos.x - viewport.value.x) / viewport.value.zoom,
    y: (pos.y - viewport.value.y) / viewport.value.zoom,
  }
}

// Get raw stage pointer position for hit detection (getAllIntersections expects this space)
function getStagePointerPos(): { x: number; y: number } {
  const stage = stageRef.value?.getNode()
  if (!stage) return { x: 0, y: 0 }
  return stage.getPointerPosition() || { x: 0, y: 0 }
}

// Extract pressure and pointer type from pointer event
function updatePointerState(event: any) {
  // Pointer events provide pressure (0-1) and pointerType ('mouse', 'pen', 'touch')
  const evt = event.evt || event
  if (evt.pressure !== undefined) {
    // For pens/stylus: pressure is 0-1
    // For mouse: pressure is usually 0.5 or 0
    // For touch: pressure is usually 0 (not supported)
    currentPressure.value = evt.pressure > 0 ? evt.pressure : 0.5
  } else {
    currentPressure.value = 0.5 // Default pressure for non-pointer events
  }

  if (evt.pointerType) {
    currentPointerType.value = evt.pointerType
  }
}

// Mouse handlers — dispatch through tool registry
function handleMouseDown(event: any) {
  // Release focus from the command line (or any input/textarea) so tool keyboard
  // steps reach the active tool: Enter to confirm a selection, 'c' to close a
  // polyline, Backspace to undo a vertex, Escape to cancel. Without this,
  // preventDefault() in handlePointerDown keeps the command input focused and
  // the global keydown guard (which ignores keys while an input is focused)
  // swallows the keystroke — so multi-step tools never advance past 'select'.
  const active = document.activeElement as HTMLElement | null
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
    active.blur()
  }
  const pos = getPointerPos(event)
  toolRegistry.dispatchMouseDown(props.currentTool as any, event, pos)
}

function handleMouseMove(event: any) {
  const pos = getPointerPos(event)

  // Update cursor presence (shared across all tools)
  updateLocalCursor(pos.x, pos.y, props.currentTool as any)
  emit('cursor-update', pos.x, pos.y)

  // Clear the snap indicator each move; snapping tools re-set it in onMouseMove.
  currentSnapPoint.value = null

  // Pan tool movement is handled in pointer handler
  if (props.currentTool === 'pan') return

  toolRegistry.dispatchMouseMove(props.currentTool as any, event, pos)
}

function handleMouseUp(event: any) {
  // Handle two-finger gesture pan cleanup
  if (isPanning.value && props.currentTool !== 'pan') {
    disablePan()
    return
  }

  const pos = getPointerPos(event)
  toolRegistry.dispatchMouseUp(props.currentTool as any, event, pos)
}

// Track drag start position for delta calculation
const dragStartPosition = ref<{ x: number; y: number } | null>(null)

/**
 * Handle drag start - record initial position for delta calculation
 */
function handleDragStart(event: any) {
  if (props.currentTool !== 'select' || !selectedId.value) return
  const node = event.target
  dragStartPosition.value = node.position()
}

/**
 * Handle drag move - for stroke/line elements that need point transformation
 */
function handleDragMove(event: any) {
  if (props.currentTool !== 'select' || !selectedId.value) return
  const element = props.elements.find(el => el.id === selectedId.value)
  if (!element || !dragStartPosition.value) return

  // Only stroke/line/arrow need special handling during drag
  if (element.type !== 'stroke' && element.type !== 'line' && element.type !== 'arrow') {
    return
  }

  const node = event.target
  const currentPosition = node.position()
  const deltaX = currentPosition.x - dragStartPosition.value.x
  const deltaY = currentPosition.y - dragStartPosition.value.y

  // Update visual position would happen automatically by Konva
  // We just track for end event
}

/**
 * Handle drag end for selected elements
 * Updates element position in Yjs after drag completes
 */
function handleDragEnd(event: any) {
  if (props.currentTool !== 'select' || !selectedId.value) return

  const node = event.target
  const element = props.elements.find(el => el.id === selectedId.value)
  if (!element) return

  // Get new position from the node
  const newPosition = node.position()
  const newScale = node.scale()
  const newRotation = node.rotation()

  // Build update based on element type
  const updates: Partial<CanvasElement> = {}

  // Handle different element types with different position properties
  if (element.type === 'rectangle' || element.type === 'ellipse' || element.type === 'text' || element.type === 'image') {
    // These use x, y
    const data = element.data as any
    updates.data = {
      ...data,
      x: newPosition.x,
      y: newPosition.y,
      scaleX: newScale.x,
      scaleY: newScale.y,
      rotation: newRotation,
    }
  } else if (element.type === 'circle') {
    // Circles use cx, cy
    const data = element.data as any
    updates.data = {
      ...data,
      cx: newPosition.x,
      cy: newPosition.y,
      scaleX: newScale.x,
      scaleY: newScale.y,
      rotation: newRotation,
    }
  } else if (element.type === 'stamp' || element.type === 'text-annotation') {
    // Groups use x, y
    const data = element.data as any
    updates.data = {
      ...data,
      x: newPosition.x,
      y: newPosition.y,
      scaleX: newScale.x,
      scaleY: newScale.y,
      rotation: newRotation,
    }
  } else if (element.type === 'stroke' || element.type === 'line' || element.type === 'arrow') {
    // Lines and arrows need point transformation - translate all points by drag delta
    const data = element.data as any
    const startPos = dragStartPosition.value
    if (startPos) {
      const deltaX = newPosition.x - startPos.x
      const deltaY = newPosition.y - startPos.y

      if (element.type === 'stroke') {
        // Translate all stroke points
        updates.data = {
          ...data,
          points: data.points.map(([px, py]: [number, number]) => [px + deltaX, py + deltaY]),
          scaleX: newScale.x,
          scaleY: newScale.y,
          rotation: newRotation,
        }
      } else if (element.type === 'line') {
        // Translate line start/end
        updates.data = {
          ...data,
          start: [data.start[0] + deltaX, data.start[1] + deltaY],
          end: [data.end[0] + deltaX, data.end[1] + deltaY],
          scaleX: newScale.x,
          scaleY: newScale.y,
          rotation: newRotation,
        }
      } else if (element.type === 'arrow') {
        // Translate all arrow points
        updates.data = {
          ...data,
          points: data.points.map(([px, py]: [number, number]) => [px + deltaX, py + deltaY]),
          scaleX: newScale.x,
          scaleY: newScale.y,
          rotation: newRotation,
        }
      }
    } else {
      // Fallback if no drag start recorded
      updates.data = {
        ...data,
        scaleX: newScale.x,
        scaleY: newScale.y,
        rotation: newRotation,
      }
    }
  } else if (element.type === 'polyline' || element.type === 'arc' || element.type === 'fillet-arc' || element.type === 'revision-cloud') {
    // Polyline/arc/fillet-arc/revision-cloud are v-line elements needing point transformation
    const data = element.data as any
    const startPos = dragStartPosition.value
    if (startPos) {
      const deltaX = newPosition.x - startPos.x
      const deltaY = newPosition.y - startPos.y

      if (element.type === 'polyline' || element.type === 'revision-cloud') {
        updates.data = {
          ...data,
          points: data.points.map(([px, py]: [number, number]) => [px + deltaX, py + deltaY]),
        }
      } else if (element.type === 'arc') {
        updates.data = {
          ...data,
          start: [data.start[0] + deltaX, data.start[1] + deltaY],
          through: [data.through[0] + deltaX, data.through[1] + deltaY],
          end: [data.end[0] + deltaX, data.end[1] + deltaY],
        }
      } else if (element.type === 'fillet-arc') {
        updates.data = {
          ...data,
          center: [data.center[0] + deltaX, data.center[1] + deltaY],
        }
      }
    }
  } else if (element.type === 'measurement-distance') {
    // Measurements use x, y for group offset
    const data = element.data as any
    updates.data = {
      ...data,
      x: newPosition.x,
      y: newPosition.y,
      scaleX: newScale.x,
      scaleY: newScale.y,
      rotation: newRotation,
    }
  }

  emit('element-update', selectedId.value, updates)

  // Reset drag start position
  dragStartPosition.value = null
}

// Pointer event handlers - unified API for mouse, touch, and pen
function handlePointerDown(event: any) {
  const evt = event.evt || event
  const pointerId = evt.pointerId

  // Track this pointer for multi-pointer gesture detection
  activePointers.value.set(pointerId, { x: evt.clientX, y: evt.clientY })

  // Check for two-finger pan (second pointer detected)
  if (activePointers.value.size === 2) {
    // Enter pan mode for two-finger gesture
    gestureState.value.isPanning = true
    gestureState.value.lastViewport = { x: viewport.value.x, y: viewport.value.y, zoom: viewport.value.zoom }

    // Don't start drawing when panning
    evt.preventDefault()
    return
  }

  // Handle pan tool - manual panning without Konva draggable
  if (props.currentTool === 'pan') {
    panStartPointer.value = { x: evt.clientX, y: evt.clientY }
    panStartViewport.value = { x: viewport.value.x, y: viewport.value.y }
    evt.preventDefault()
    return
  }

  // Single pointer - update pressure and pointer type
  updatePointerState(event)

  // Prevent default to avoid 300ms delay on iOS
  if (evt.preventDefault) {
    evt.preventDefault()
  }

  // Delegate to mouse handler for drawing logic
  handleMouseDown(event)
}

function handlePointerMove(event: any) {
  const evt = event.evt || event
  const pointerId = evt.pointerId

  // Update pointer position for gesture tracking
  if (activePointers.value.has(pointerId)) {
    activePointers.value.set(pointerId, { x: evt.clientX, y: evt.clientY })
  }

  // Handle pan tool dragging
  if (props.currentTool === 'pan' && panStartPointer.value && panStartViewport.value) {
    const deltaX = evt.clientX - panStartPointer.value.x
    const deltaY = evt.clientY - panStartPointer.value.y

    // Update cursor to grabbing when actively dragging
    const stage = stageRef.value?.getNode()
    const container = stage?.container()
    if (container) {
      container.style.setProperty('cursor', 'grabbing')
    }

    // Update viewport using setViewportDirect (Konva stage will re-render via stageConfig)
    setViewportDirect({
      x: panStartViewport.value.x + deltaX,
      y: panStartViewport.value.y + deltaY,
    })

    evt.preventDefault()
    return
  }

  // Handle two-finger pan gesture
  if (gestureState.value.isPanning && activePointers.value.size === 2) {
    const pointers = Array.from(activePointers.value.values())
    if (pointers.length === 2) {
      // Calculate movement delta from first pointer
      // We need to track the movement, but for simplicity use current position
      // relative to the last viewport position
      const pointer1 = pointers[0]!
      const pointer2 = pointers[1]!

      // Calculate centroid
      const centerX = (pointer1.x + pointer2.x) / 2
      const centerY = (pointer1.y + pointer2.y) / 2

      // Update viewport - we'd need to track delta from previous position
      // For now, use Konva's built-in drag or require explicit pan tool
      // A simpler approach: enable pan mode during two-finger gesture
      if (!isPanning.value) {
        enablePan()
      }

      evt.preventDefault()
      return
    }
  }

  // Update pressure from pointer event during drawing
  updatePointerState(event)

  // Prevent default during drawing
  if (isDrawing.value && evt.preventDefault) {
    evt.preventDefault()
  }

  // Delegate to mouse handler for drawing logic
  handleMouseMove(event)
}

function handlePointerUp(event: any) {
  const evt = event.evt || event
  const pointerId = evt.pointerId

  // Remove pointer from active tracking
  activePointers.value.delete(pointerId)

  // Clear pan tool state and restore cursor
  if (props.currentTool === 'pan') {
    panStartPointer.value = null
    panStartViewport.value = null
    // Restore grab cursor after releasing drag
    const stage = stageRef.value?.getNode()
    const container = stage?.container()
    if (container) {
      container.style.setProperty('cursor', 'grab')
    }
  }

  // Exit pan mode if less than 2 pointers (for two-finger gesture panning only)
  // Don't disable if pan tool is intentionally selected
  if (activePointers.value.size < 2) {
    if (gestureState.value.isPanning) {
      gestureState.value.isPanning = false
      // Only disable pan if it's from two-finger gesture, not from pan tool selection
      if (isPanning.value && props.currentTool !== 'pan') {
        disablePan()
      }
    }
  }

  // Reset pressure on pointer up
  currentPressure.value = 0.5

  // Prevent default
  if (evt.preventDefault) {
    evt.preventDefault()
  }

  // Delegate to mouse handler for cleanup
  handleMouseUp(event)
}

function handlePointerLeave(event: any) {
  const evt = event.evt || event
  const pointerId = evt.pointerId


  // Remove pointer from active tracking when leaving canvas
  activePointers.value.delete(pointerId)

  // Only treat pointer leaving as pointer up if mouse button is NOT still pressed
  // evt.buttons is a bitfield: 1 = left button, 2 = right button, 4 = middle button
  // If the user is still holding the button down, don't end the drawing
  if (!isDrawing.value || (evt.buttons & 1) === 0) {
    handlePointerUp(event)
  }
  // If still drawing and button pressed, the stroke will continue when pointer re-enters
}

// Track pointer cancellation (e.g., palm rejection, system gesture)
function handlePointerCancel(event: any) {
  const evt = event.evt || event

  // Only end drawing if mouse button is not still pressed
  if (!isDrawing.value || (evt.buttons & 1) === 0) {
    handlePointerUp(event)
  }
}

// Cache for stroke outlines keyed by element ID to avoid redundant getStroke() calls
const strokeOutlineCache = new Map<string, { version: number; outline: number[][] }>()

function getStrokeConfig(element: CanvasElement) {
  const data = element.data as StrokeElement

  // Check cache — getStroke is expensive for large point arrays
  const cached = strokeOutlineCache.get(element.id)
  if (cached && cached.version === element.timestamp) {
    return buildStrokeConfig(cached.outline, data)
  }

  const outline = getStroke(data.points, {
    size: data.size,
    thinning: data.tool === 'highlighter' ? 0 : 0.5,
    smoothing: 0.5,
    streamline: 0.5,
  })

  strokeOutlineCache.set(element.id, { version: element.timestamp, outline })
  return buildStrokeConfig(outline, data)
}

function buildStrokeConfig(outline: number[][], data: StrokeElement) {
  const flatPoints = outline.flatMap(p => [p[0], p[1]])
  return {
    points: flatPoints,
    stroke: data.color,
    strokeWidth: 1,
    fill: data.color,
    globalAlpha: data.tool === 'highlighter' ? 0.5 : 1,
    lineCap: 'round',
    lineJoin: 'round',
    closed: true,
    draggable: true,
    hitStrokeWidth: 0,
  }
}

/**
 * Get config for rendering remote active stroke (preview state)
 * Uses lower opacity to indicate in-progress state
 */
function getActiveStrokeConfig(strokeId: string, points: [number, number, number][]) {
  // Extract userId from strokeId to get user color
  const userId = strokeId.split('-')[0]!
  const userColor = getUserColor(userId)

  // Use perfect-freehand to render smooth stroke as filled polygon
  const outline = getStroke(points, {
    size: 4,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
  })

  const flatPoints = outline.flatMap(p => [p[0], p[1]])

  return {
    points: flatPoints,
    stroke: userColor,
    strokeWidth: 1,
    fill: userColor,
    globalAlpha: 0.7,  // Slightly transparent to show in-progress state
    lineCap: 'round',
    lineJoin: 'round',
    closed: true,
    listening: false,  // Active strokes shouldn't capture clicks
    hitStrokeWidth: 0,  // Disable pixel-perfect hit detection
  }
}

function getLineConfig(element: CanvasElement) {
  const data = element.data as LineElement
  return {
    points: [data.start[0], data.start[1], data.end[0], data.end[1]],
    stroke: data.color,
    strokeWidth: data.size,
    lineCap: 'round',
    draggable: true,
    hitStrokeWidth: 0,  // Disable pixel-perfect hit detection
  }
}

function getArrowConfig(element: CanvasElement) {
  const data = element.data as ArrowElement
  // Flatten points array: [[x1, y1], [x2, y2]] -> [x1, y1, x2, y2]
  const points = data.points.flatMap(p => p)

  return {
    points,
    pointerLength: data.pointerLength || 10,
    pointerWidth: data.pointerWidth || 10,
    stroke: data.stroke,
    strokeWidth: data.strokeWidth,
    fill: data.fill,
    lineCap: 'round',
    lineJoin: 'round',
    draggable: true,
    hitStrokeWidth: 0,  // Disable pixel-perfect hit detection
  }
}

function getRectConfig(element: CanvasElement) {
  const data = element.data as RectangleElement
  return {
    x: data.x,
    y: data.y,
    width: data.width,
    height: data.height,
    stroke: data.stroke,
    strokeWidth: data.strokeWidth,
    fill: data.fill || 'transparent',
    draggable: true,
    hitStrokeWidth: 0,  // Disable pixel-perfect hit detection
  }
}

function getCircleConfig(element: CanvasElement) {
  const data = element.data as CircleElement
  return {
    x: data.cx,
    y: data.cy,
    radius: data.radius,
    stroke: data.stroke,
    strokeWidth: data.strokeWidth,
    fill: data.fill || 'transparent',
    draggable: true,
    hitStrokeWidth: 0,  // Disable pixel-perfect hit detection
  }
}

function getEllipseConfig(element: CanvasElement) {
  const data = element.data as EllipseElement
  return {
    x: data.x,
    y: data.y,
    radiusX: data.radiusX,
    radiusY: data.radiusY,
    rotation: data.rotation,
    stroke: data.stroke,
    strokeWidth: data.strokeWidth,
    fill: data.fill || 'transparent',
    draggable: true,
    hitStrokeWidth: 0,  // Disable pixel-perfect hit detection
  }
}

function getPolylineConfig(element: CanvasElement) {
  const data = element.data as PolylineElement
  const flatPoints = data.points.flatMap(p => [p[0], p[1]])
  return {
    points: flatPoints,
    stroke: data.color,
    strokeWidth: data.size,
    lineCap: 'round',
    lineJoin: 'round',
    closed: data.closed,
    draggable: true,
    hitStrokeWidth: 0,
  }
}

function getArcConfig(element: CanvasElement) {
  const data = element.data as ArcElement
  const arcParams = calculateArcParams(data.start, data.through, data.end)
  if (!arcParams) {
    return {
      points: [data.start[0], data.start[1], data.end[0], data.end[1]],
      stroke: data.color,
      strokeWidth: data.size,
      lineCap: 'round',
      draggable: true,
      hitStrokeWidth: 0,
    }
  }
  const segmentCount = 64
  const angleStep = (arcParams.endAngle - arcParams.startAngle) / segmentCount
  const points: number[] = []
  for (let i = 0; i <= segmentCount; i++) {
    const angle = arcParams.startAngle + angleStep * i
    points.push(arcParams.cx + arcParams.radius * Math.cos(angle))
    points.push(arcParams.cy + arcParams.radius * Math.sin(angle))
  }
  return {
    points,
    stroke: data.color,
    strokeWidth: data.size,
    lineCap: 'round',
    lineJoin: 'round',
    draggable: true,
    hitStrokeWidth: 0,
  }
}

function getRevisionCloudConfig(element: CanvasElement) {
  const data = element.data as RevisionCloudElement
  const cloudPoints = data.points.map(p => ({ x: p[0], y: p[1] }))
  const points = revisionCloudPath(cloudPoints, data.arcLength, data.closed)
  return {
    points,
    stroke: data.color,
    strokeWidth: data.size,
    lineCap: 'round',
    lineJoin: 'round',
    closed: data.closed,
    draggable: true,
    hitStrokeWidth: 0,
  }
}

function getFilletArcConfig(element: CanvasElement) {
  const data = element.data as FilletArcElement
  const segmentCount = 32
  const points: number[] = []
  // Determine sweep direction (shortest arc)
  let sweep = data.endAngle - data.startAngle
  if (sweep > Math.PI) sweep -= 2 * Math.PI
  if (sweep < -Math.PI) sweep += 2 * Math.PI
  const angleStep = sweep / segmentCount
  for (let i = 0; i <= segmentCount; i++) {
    const angle = data.startAngle + angleStep * i
    points.push(data.center[0] + data.radius * Math.cos(angle))
    points.push(data.center[1] + data.radius * Math.sin(angle))
  }
  return {
    points,
    stroke: data.color,
    strokeWidth: data.size,
    lineCap: 'round',
    lineJoin: 'round',
    draggable: true,
    hitStrokeWidth: 0,
  }
}

// Dimension rendering helpers
function getDimensionLineParts(
  start: [number, number],
  end: [number, number],
  offset: number,
): { dimLineStart: { x: number; y: number }; dimLineEnd: { x: number; y: number }; extStart1: { x: number; y: number }; extStart2: { x: number; y: number }; extEnd1: { x: number; y: number }; extEnd2: { x: number; y: number } } {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) {
    return {
      dimLineStart: { x: start[0], y: start[1] + offset },
      dimLineEnd: { x: end[0], y: end[1] + offset },
      extStart1: { x: start[0], y: start[1] },
      extStart2: { x: start[0], y: start[1] + offset },
      extEnd1: { x: end[0], y: end[1] },
      extEnd2: { x: end[0], y: end[1] + offset },
    }
  }
  // Perpendicular unit vector (left side = positive offset)
  const nx = -dy / len
  const ny = dx / len

  const dimLineStart = { x: start[0] + nx * offset, y: start[1] + ny * offset }
  const dimLineEnd = { x: end[0] + nx * offset, y: end[1] + ny * offset }

  // Extension lines: from the measured points to slightly past the dimension line
  const extOvershoot = 6
  const extEnd1Offset = offset >= 0 ? offset + extOvershoot : offset - extOvershoot

  return {
    dimLineStart,
    dimLineEnd,
    extStart1: { x: start[0], y: start[1] },
    extStart2: { x: start[0] + nx * extEnd1Offset, y: start[1] + ny * extEnd1Offset },
    extEnd1: { x: end[0], y: end[1] },
    extEnd2: { x: end[0] + nx * extEnd1Offset, y: end[1] + ny * extEnd1Offset },
  }
}

function getDimensionConfigs(element: CanvasElement) {
  const data = element.data as DimensionElement
  const parts = getDimensionLineParts(data.start, data.end, data.offset)
  const tickSize = 6

  const dx = data.end[0] - data.start[0]
  const dy = data.end[1] - data.start[1]
  const len = Math.sqrt(dx * dx + dy * dy)
  // Unit vector along dimension line
  const ux = len > 0 ? dx / len : 1
  const uy = len > 0 ? dy / len : 0
  // Perpendicular unit vector
  const nx = -uy
  const ny = ux

  const stroke = data.color
  const strokeWidth = Math.max(data.size, 1)

  return [
    // Dimension line
    {
      points: [parts.dimLineStart.x, parts.dimLineStart.y, parts.dimLineEnd.x, parts.dimLineEnd.y],
      stroke,
      strokeWidth,
      listening: false,
      hitStrokeWidth: 10,
    },
    // Extension line 1
    {
      points: [parts.extStart1.x, parts.extStart1.y, parts.extStart2.x, parts.extStart2.y],
      stroke,
      strokeWidth: Math.max(strokeWidth * 0.5, 0.5),
      listening: false,
    },
    // Extension line 2
    {
      points: [parts.extEnd1.x, parts.extEnd1.y, parts.extEnd2.x, parts.extEnd2.y],
      stroke,
      strokeWidth: Math.max(strokeWidth * 0.5, 0.5),
      listening: false,
    },
    // Tick mark at dimension line start
    {
      points: [
        parts.dimLineStart.x + nx * tickSize, parts.dimLineStart.y + ny * tickSize,
        parts.dimLineStart.x - nx * tickSize, parts.dimLineStart.y - ny * tickSize,
      ],
      stroke,
      strokeWidth,
      listening: false,
    },
    // Tick mark at dimension line end
    {
      points: [
        parts.dimLineEnd.x + nx * tickSize, parts.dimLineEnd.y + ny * tickSize,
        parts.dimLineEnd.x - nx * tickSize, parts.dimLineEnd.y - ny * tickSize,
      ],
      stroke,
      strokeWidth,
      listening: false,
    },
  ]
}

function getDimensionTextConfig(element: CanvasElement) {
  const data = element.data as DimensionElement
  const parts = getDimensionLineParts(data.start, data.end, data.offset)
  const midX = (parts.dimLineStart.x + parts.dimLineEnd.x) / 2
  const midY = (parts.dimLineStart.y + parts.dimLineEnd.y) / 2

  const dx = data.end[0] - data.start[0]
  const dy = data.end[1] - data.start[1]
  const pixelDist = Math.sqrt(dx * dx + dy * dy)
  const value = data.value ?? +(pixelDist / data.pixelsPerInch).toFixed(data.precision)

  const unitLabel = data.unit === 'feet' ? ' ft' : ' in'
  const text = `${value}${unitLabel}`

  // Rotate text to align with dimension line
  let angle = Math.atan2(dy, dx) * 180 / Math.PI
  // Keep text readable (not upside down)
  if (angle > 90) angle -= 180
  if (angle < -90) angle += 180

  const fontSize = 12

  return {
    x: midX,
    y: midY,
    text,
    fontSize,
    fill: data.color,
    fontFamily: 'monospace',
    align: 'center',
    verticalAlign: 'middle',
    rotation: angle,
    offsetX: text.length * fontSize * 0.3,
    offsetY: fontSize * 0.4,
    listening: false,
    padding: 2,
    wrap: 'none',
  }
}

function getDimensionPreviewConfigs(start: [number, number], end: [number, number], offset: number) {
  const configs = getDimensionConfigs({
    id: '',
    type: 'dimension',
    userId: '',
    userName: '',
    timestamp: 0,
    data: {
      start,
      end,
      offset,
      pixelsPerInch: 96,
      unit: 'inches',
      precision: 4,
      style: 'linear',
      color: '#8B5CF6',
      size: 1,
    } as DimensionElement,
  } as CanvasElement)
  // Make all preview lines non-draggable and dashed
  return configs.map(c => ({
    ...c,
    dash: [4, 4],
    listening: false,
  }))
}

function calculateArcParams(
  start: [number, number],
  through: [number, number],
  end: [number, number]
): { cx: number; cy: number; radius: number; startAngle: number; endAngle: number } | null {
  const [x1, y1] = start
  const [x2, y2] = through
  const [x3, y3] = end
  const cross = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1)
  if (Math.abs(cross) < 1e-10) return null
  const mid1x = (x1 + x2) / 2, mid1y = (y1 + y2) / 2
  const d1x = x2 - x1, d1y = y2 - y1
  const mid2x = (x2 + x3) / 2, mid2y = (y2 + y3) / 2
  const d2x = x3 - x2, d2y = y3 - y2
  const det = d1x * d2y - d1y * d2x
  if (Math.abs(det) < 1e-10) return null
  const t = ((mid2x - mid1x) * d2y - (mid2y - mid1y) * d2x) / det
  const cx = mid1x + t * d1y
  const cy = mid1y - t * d1x
  const radius = Math.hypot(x1 - cx, y1 - cy)
  const startAngle = Math.atan2(y1 - cy, x1 - cx)
  const endAngle = Math.atan2(y3 - cy, x3 - cx)
  return { cx, cy, radius, startAngle, endAngle }
}

function getImageConfig(element: CanvasElement) {
  const data = element.data as ImageElement

  // Cache Image objects by src so we don't create + load a new one on every render
  let image = elementImageCache.get(data.src)
  if (!image) {
    image = new Image()
    image.crossOrigin = 'anonymous'
    image.src = data.src
    elementImageCache.set(data.src, image)
  }

  return {
    x: data.x,
    y: data.y,
    image,
    width: data.width,
    height: data.height,
    draggable: true,
    hitStrokeWidth: 0,
  }
}

function getTextConfig(element: CanvasElement) {
  const data = element.data as TextElement
  return {
    x: data.x,
    y: data.y,
    text: data.text,
    fontSize: data.fontSize,
    fill: data.color,
    fontFamily: data.fontFamily,
    draggable: true,
    hitStrokeWidth: 0,  // Disable pixel-perfect hit detection
  }
}

// Text annotation config helpers
function getTextAnnotationConfig(element: CanvasElement) {
  const data = element.data as TextAnnotationElement
  return {
    x: data.x,
    y: data.y,
    draggable: true,
  }
}

function getTextAnnotationTextConfig(element: CanvasElement) {
  const data = element.data as TextAnnotationElement
  const leaderEnd = data.leaderLine.end

  return {
    text: data.text,
    x: leaderEnd[0] - data.x,
    y: leaderEnd[1] - data.y + 20,  // Offset below the leader line end
    fontSize: data.fontSize,
    fill: data.color,
    fontFamily: data.fontFamily,
    padding: 8,
  }
}

function getTextAnnotationLineConfig(element: CanvasElement) {
  const data = element.data as TextAnnotationElement

  return {
    // Points relative to group position (data.x, data.y)
    points: [
      data.leaderLine.start[0] - data.x,
      data.leaderLine.start[1] - data.y,
      data.leaderLine.end[0] - data.x,
      data.leaderLine.end[1] - data.y,
    ],
    stroke: data.color,
    strokeWidth: 2,
    lineCap: 'round',
    hitStrokeWidth: 0,  // Disable pixel-perfect hit detection
  }
}

// Stamp config helpers
function getStampGroupConfig(element: CanvasElement) {
  const data = element.data as StampElement
  return {
    x: data.x,
    y: data.y,
    draggable: true,
    hitStrokeWidth: 0,  // Disable pixel-perfect hit detection
  }
}

function getStampRectConfig(element: CanvasElement) {
  const data = element.data as StampElement
  return {
    width: data.width,
    height: data.height,
    fill: data.backgroundColor,
    stroke: data.borderColor,
    strokeWidth: 2,
    cornerRadius: data.borderRadius,
    shadowColor: 'rgba(0, 0, 0, 0.2)',
    shadowBlur: 4,
    shadowOffset: { x: 0, y: 2 },
  }
}

function getStampTextConfig(element: CanvasElement) {
  const data = element.data as StampElement
  return {
    text: data.text,
    x: 0,
    y: 0,
    width: data.width,
    height: data.height,
    fontSize: data.fontSize,
    fill: data.textColor,
    fontFamily: 'Arial, sans-serif',
    fontStyle: 'bold',
    align: 'center',
    verticalAlign: 'middle',
  }
}

// Measurement distance config helpers
function getMeasurementGroupConfig(element: CanvasElement) {
  return { x: 0, y: 0, draggable: true }
}

function getMeasurementLineConfig(element: CanvasElement) {
  const data = element.data as MeasurementDistanceElement
  const isStale = isMeasurementStale(element, pixelsPerInch.value)
  return {
    points: [data.start[0], data.start[1], data.end[0], data.end[1]],
    stroke: isStale ? '#F59E0B' : '#3B82F6',  // Amber for stale measurements
    strokeWidth: 2,
    lineCap: 'round',
    dash: isStale ? [5, 5] : undefined,  // Dashed line for stale
    hitStrokeWidth: 0,  // Disable pixel-perfect hit detection
  }
}

function getMeasurementStartAnchor(element: CanvasElement) {
  const data = element.data as MeasurementDistanceElement
  return {
    x: data.start[0],
    y: data.start[1],
    radius: 5,
    fill: '#3B82F6',
    stroke: '#FFFFFF',
    strokeWidth: 2,
  }
}

function getMeasurementEndAnchor(element: CanvasElement) {
  const data = element.data as MeasurementDistanceElement
  return {
    x: data.end[0],
    y: data.end[1],
    radius: 5,
    fill: '#3B82F6',
    stroke: '#FFFFFF',
    strokeWidth: 2,
  }
}

function getMeasurementLabelConfig(element: CanvasElement) {
  const data = element.data as MeasurementDistanceElement
  const inches = data.value ?? calculateDistance(data.start, data.end) / data.pixelsPerInch
  const label = formatDistanceMeasurement(inches, data.precision, data.unit)
  const isStale = isMeasurementStale(element, pixelsPerInch.value)
  const midX = (data.start[0] + data.end[0]) / 2
  const midY = (data.start[1] + data.end[1]) / 2
  return {
    text: label + (isStale ? ' (!)' : ''),
    x: midX,
    y: midY - 15,
    fontSize: 14,
    fill: isStale ? '#F59E0B' : '#3B82F6',
    fontFamily: 'Arial, sans-serif',
    align: 'center',
  }
}

// Element click handler for selection
function handleElementClick(element: CanvasElement, evt: any) {
  if (props.currentTool === 'select') {
    const node = evt.target
    // For groups (stamps, text-annotations), get the parent group
    const targetNode = node.getParent()?.className === 'Group' ? node.getParent() : node
    selectElement(element.id, targetNode)
    evt.cancelBubble = true
  } else if (props.currentTool === 'measure-distance' && evt.evt.detail === 2) {
    // Double-click on measurement with measure tool active - open edit dialog
    handleMeasurementDoubleClick(element)
    evt.cancelBubble = true
  }
}

// Current leader line preview for text annotation
const currentLeaderLinePreview = computed(() => {
  if (!textAnnotationStart.value || !currentLeaderLineEnd.value) return null

  const start = textAnnotationStart.value
  const end = currentLeaderLineEnd.value

  return {
    points: [start.x, start.y, end.x, end.y],
    stroke: props.currentColor,
    strokeWidth: 2,
    dash: [5, 5],  // Dashed for preview
  }
})

// Current stroke config
const currentStrokeConfig = computed(() => {
  if (currentStrokePoints.value.length < 2) {
    return { points: [], stroke: props.currentColor, strokeWidth: 1 }
  }

  // Render using perfect-freehand for preview
  const outline = getStroke(currentStrokePoints.value, {
    size: props.currentSize,
    thinning: props.currentTool === 'highlighter' ? 0 : 0.5,
    smoothing: 0.5,
    streamline: 0.5,
  })

  const flatPoints = outline.flatMap(p => [p[0], p[1]])

  return {
    points: flatPoints,
    stroke: props.currentColor,
    strokeWidth: 1,  // Outline is filled, so stroke width doesn't matter
    fill: props.currentColor,
    globalAlpha: props.currentTool === 'highlighter' ? 0.5 : 1,
    lineCap: 'round',
    lineJoin: 'round',
    closed: true,
  }
})

// Current arrow preview config
const currentArrowPreview = computed(() => {
  if (!arrowStart.value || !currentArrowEnd.value) return null

  return {
    points: [arrowStart.value.x, arrowStart.value.y, currentArrowEnd.value.x, currentArrowEnd.value.y],
    pointerLength: 10,
    pointerWidth: 10,
    stroke: props.currentColor,
    strokeWidth: props.currentSize,
    fill: props.currentColor,
    lineCap: 'round',
    lineJoin: 'round',
    dash: [5, 5],  // Dashed line for preview
  }
})

// Current line preview config
const currentLinePreview = computed(() => {
  if (!lineStart.value || !currentLineEnd.value) return null

  return {
    points: [lineStart.value.x, lineStart.value.y, currentLineEnd.value.x, currentLineEnd.value.y],
    stroke: props.currentColor,
    strokeWidth: props.currentSize,
    lineCap: 'round',
    dash: [5, 5],  // Dashed line for preview
  }
})

// Current shape preview config
const currentShapePreview = computed(() => {
  if (!shapeStart.value || !currentShapeEnd.value) return null

  const start = shapeStart.value
  const end = currentShapeEnd.value

  // Rectangle preview
  if (props.currentTool === 'rectangle') {
    const x = Math.min(start.x, end.x)
    const y = Math.min(start.y, end.y)
    const width = Math.abs(end.x - start.x)
    const height = Math.abs(end.y - start.y)

    return {
      type: 'rectangle',
      config: {
        x, y, width, height,
        stroke: props.currentColor,
        strokeWidth: props.currentSize,
        fill: 'transparent',
        dash: [5, 5],  // Dashed for preview
      }
    }
  }

  // Circle preview
  if (props.currentTool === 'circle') {
    const dx = end.x - start.x
    const dy = end.y - start.y
    const radius = Math.sqrt(dx * dx + dy * dy)

    return {
      type: 'circle',
      config: {
        x: start.x,
        y: start.y,
        radius,
        stroke: props.currentColor,
        strokeWidth: props.currentSize,
        fill: 'transparent',
        dash: [5, 5],
      }
    }
  }

  // Ellipse preview
  if (props.currentTool === 'ellipse') {
    const x = Math.min(start.x, end.x)
    const y = Math.min(start.y, end.y)
    const width = Math.abs(end.x - start.x)
    const height = Math.abs(end.y - start.y)

    return {
      type: 'ellipse',
      config: {
        x: x + width / 2,
        y: y + height / 2,
        radiusX: width / 2,
        radiusY: height / 2,
        rotation: 0,
        stroke: props.currentColor,
        strokeWidth: props.currentSize,
        fill: 'transparent',
        dash: [5, 5],
      }
    }
  }

  return null
})

// Current polyline preview config
const currentPolylinePreview = computed(() => {
  if (!polylineIsDrawing.value || polylineVertices.value.length === 0) return null

  const points = polylineVertices.value.flatMap((v: { x: number; y: number }) => [v.x, v.y])
  if (polylineCurrentVertex.value) {
    points.push(polylineCurrentVertex.value.x, polylineCurrentVertex.value.y)
  }

  return {
    points,
    stroke: props.currentColor,
    strokeWidth: props.currentSize,
    lineCap: 'round',
    lineJoin: 'round',
    dash: [5, 5],
    listening: false,
  }
})

// Current revision cloud preview config
const currentRevisionCloudPreview = computed(() => {
  if (!revisionCloudIsDrawing.value || revisionCloudVertices.value.length === 0) return null

  const pts = revisionCloudVertices.value.map((v: { x: number; y: number }) => ({ x: v.x, y: v.y }))
  if (revisionCloudCurrentVertex.value) {
    pts.push({ x: revisionCloudCurrentVertex.value.x, y: revisionCloudCurrentVertex.value.y })
  }
  if (pts.length < 2) return null

  // Open during placement: drawing closed here would add a lobe from the
  // cursor back to the first vertex (a phantom lobe stretching across the
  // canvas as you move). Side stays consistent with the finished cloud via
  // the winding-based logic inside revisionCloudPath.
  const points = revisionCloudPath(pts, DEFAULT_REVISION_CLOUD_ARC_LENGTH, false)
  return {
    points,
    stroke: props.currentColor,
    strokeWidth: props.currentSize,
    lineCap: 'round',
    lineJoin: 'round',
    closed: false,
    dash: [5, 5],
    listening: false,
  }
})

// Current arc preview config
const currentArcPreview = computed(() => {
  if (!arcIsDrawing.value || arcClickState.value.length === 0) return null

  if (arcClickState.value.length === 1 && arcCurrentCursor.value) {
    // Preview line from start to cursor
    return {
      points: [arcClickState.value[0]![0], arcClickState.value[0]![1], arcCurrentCursor.value.x, arcCurrentCursor.value.y],
      stroke: props.currentColor,
      strokeWidth: props.currentSize,
      lineCap: 'round',
      dash: [5, 5],
      listening: false,
    }
  }

  if (arcClickState.value.length === 2 && arcCurrentCursor.value) {
    // Preview arc from start through second point to cursor
    const start = arcClickState.value[0]!
    const through = arcClickState.value[1]!
    const end: [number, number] = [arcCurrentCursor.value.x, arcCurrentCursor.value.y]
    const arcParams = calculateArcPreviewParams(start, through, end)
    if (!arcParams) {
      return {
        points: [start[0], start[1], end[0], end[1]],
        stroke: props.currentColor,
        strokeWidth: props.currentSize,
        lineCap: 'round',
        dash: [5, 5],
        listening: false,
      }
    }
    const segmentCount = 64
    const angleStep = (arcParams.endAngle - arcParams.startAngle) / segmentCount
    const pts: number[] = []
    for (let i = 0; i <= segmentCount; i++) {
      const angle = arcParams.startAngle + angleStep * i
      pts.push(arcParams.cx + arcParams.radius * Math.cos(angle))
      pts.push(arcParams.cy + arcParams.radius * Math.sin(angle))
    }
    return {
      points: pts,
      stroke: props.currentColor,
      strokeWidth: props.currentSize,
      lineCap: 'round',
      lineJoin: 'round',
      dash: [5, 5],
      listening: false,
    }
  }

  return null
})

function calculateArcPreviewParams(
  start: [number, number],
  through: [number, number],
  end: [number, number]
): { cx: number; cy: number; radius: number; startAngle: number; endAngle: number } | null {
  const [x1, y1] = start
  const [x2, y2] = through
  const [x3, y3] = end
  const cross = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1)
  if (Math.abs(cross) < 1e-10) return null
  const mid1x = (x1 + x2) / 2, mid1y = (y1 + y2) / 2
  const d1x = x2 - x1, d1y = y2 - y1
  const mid2x = (x2 + x3) / 2, mid2y = (y2 + y3) / 2
  const d2x = x3 - x2, d2y = y3 - y2
  const det = d1x * d2y - d1y * d2x
  if (Math.abs(det) < 1e-10) return null
  const t = ((mid2x - mid1x) * d2y - (mid2y - mid1y) * d2x) / det
  const cx = mid1x + t * d1y
  const cy = mid1y - t * d1x
  const radius = Math.hypot(x1 - cx, y1 - cy)
  const startAngle = Math.atan2(y1 - cy, x1 - cx)
  const endAngle = Math.atan2(y3 - cy, x3 - cx)
  return { cx, cy, radius, startAngle, endAngle }
}
function getGuideLinePoints(result: { point: { x: number; y: number }; angle: number; snapped: boolean } | null): number[] {
  if (!result?.snapped) return []
  // We need the tool's start point to draw the guide from origin to edge
  // Use whichever tool start is active
  const origin = lineStart.value || arrowStart.value || shapeStart.value
  if (!origin) return []
  // Extend the guide line well beyond the cursor
  const rad = (result.angle * Math.PI) / 180
  const extend = 3000
  return [
    origin.x, origin.y,
    origin.x + extend * Math.cos(rad),
    origin.y - extend * Math.sin(rad),
  ]
}

// Export canvas as image
function exportAsImage(): string | null {
  const stage = stageRef.value?.getNode()
  if (!stage) return null
  return stage.toDataURL({ pixelRatio: 2 })
}

// Load PDF and add to canvas
async function loadPDF(arrayBuffer: ArrayBuffer, fileName: string) {
  // Cancel any existing load
  if (pdfAbortController.value) {
    pdfAbortController.value.abort()
  }

  // Create new abort controller
  pdfAbortController.value = new AbortController()
  pdfFileName.value = fileName

  const { loadAndRenderPage } = usePDFRendering()

  try {
    // Reset loading state
    pdfLoadingState.value = { loading: true, loaded: 0, total: 100, percent: 0 }

    // Load and render first page
    const { dataUrl, totalPages } = await loadAndRenderPage(arrayBuffer, 1, {
      onProgress: (state) => {
        pdfLoadingState.value = state
      },
      signal: pdfAbortController.value.signal,
    })

    // Create image element from rendered PDF
    const img = new Image()
    img.src = dataUrl

    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
    })

    // Add as canvas element
    const element: CanvasElement = {
      id: `${props.userId}-pdf-${Date.now()}`,
      type: 'image',
      userId: props.userId,
      userName: props.userName,
      timestamp: Date.now(),
      data: {
        src: dataUrl,
        x: 100,
        y: 100,
        width: img.width,
        height: img.height,
      } as ImageElement,
    }

    emit('element-add', element)

    // Clear loading state
    pdfLoadingState.value = { loading: false, loaded: 1, total: 1, percent: 100 }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      // User cancelled - clear state
      pdfLoadingState.value = { loading: false, loaded: 0, total: 0, percent: 0 }
    } else {
      // Error occurred
      const message = error instanceof Error ? error.message : 'Failed to load PDF'
      pdfLoadingState.value = {
        loading: false,
        loaded: 0,
        total: 0,
        percent: 0,
        error: message,
      }
    }
  } finally {
    pdfAbortController.value = null
  }
}

// Cancel PDF loading
function cancelPDFLoad() {
  pdfAbortController.value?.abort()
}

// Close loading indicator
function closeLoadingIndicator() {
  pdfLoadingState.value = { loading: false, loaded: 0, total: 0, percent: 0 }
}

/**
 * Get consistent color for user based on userId
 * Matches the color generation in useCollaborativeCanvas.ts
 */
function getUserColor(userId: string): string {
  const colors = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'] as const
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]!
}

/**
 * Handle double-click on measurement to open edit dialog
 */
function handleMeasurementDoubleClick(element: CanvasElement) {
  if (element.type === 'measurement-distance') {
    editingMeasurementElement.value = element
    const data = element.data as MeasurementDistanceElement
    pendingMeasurementValue.value = String(data.value ?? 0)
    showMeasurementEditDialog.value = true
  }
}

/**
 * Confirm measurement value edit
 */
function confirmMeasurementEdit() {
  if (!editingMeasurementElement.value) return

  const newValue = parseFloat(pendingMeasurementValue.value)
  if (isNaN(newValue)) return

  // Update the element with the new measurement value
  emit('element-update', editingMeasurementElement.value.id, {
    data: {
      ...editingMeasurementElement.value.data,
      value: newValue
    }
  })

  showMeasurementEditDialog.value = false
  editingMeasurementElement.value = null
  pendingMeasurementValue.value = ''
}

/**
 * Cancel measurement edit
 */
function cancelMeasurementEdit() {
  showMeasurementEditDialog.value = false
  editingMeasurementElement.value = null
  pendingMeasurementValue.value = ''
}

// Get center point of a shape element (for area measurement positioning)
function getShapeCenter(element: CanvasElement): { x: number; y: number } {
  switch (element.type) {
    case 'rectangle': {
      const data = element.data as RectangleElement
      return {
        x: data.x + data.width / 2,
        y: data.y + data.height / 2
      }
    }
    case 'circle': {
      const data = element.data as CircleElement
      return { x: data.cx, y: data.cy }
    }
    case 'ellipse': {
      const data = element.data as EllipseElement
      return { x: data.x, y: data.y }
    }
    default:
      return { x: 0, y: 0 }
  }
}

// Calculate distance between two points
function calculateDistance(p1: [number, number], p2: [number, number]): number {
  return Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
}

// Format distance measurement for display
function formatDistanceMeasurement(inches: number, precision: number, unit: 'inches' | 'feet'): string {
  if (unit === 'feet') {
    const feet = inches / 12
    return `${feet.toFixed(precision)}'`
  }
  return `${inches.toFixed(precision)}"`
}

// Format area measurement for display
function formatAreaMeasurement(sqInches: number, precision: number, unit: 'sq-inches' | 'sq-feet'): string {
  if (unit === 'sq-feet') {
    const sqFeet = sqInches / 144
    return `${sqFeet.toFixed(precision)} sq ft`
  }
  return `${sqInches.toFixed(precision)} sq in`
}

// Get area measurement label config
function getAreaLabelConfig(element: CanvasElement) {
  const data = element.data as MeasurementAreaElement
  const value = data.value ?? 0
  const label = formatAreaMeasurement(value, data.precision, data.unit)
  const isStale = isMeasurementStale(element, pixelsPerInch.value)
  return {
    text: label + (isStale ? ' (!)' : ''),
    x: 0,
    y: 0,
    fontSize: 12,
    fill: isStale ? '#F59E0B' : '#3B82F6',
    fontFamily: 'Arial, sans-serif',
  }
}

// Get area label position (above the target shape)
function getAreaLabelPosition(element: CanvasElement): { x: number; y: number } {
  const data = element.data as MeasurementAreaElement
  const target = props.elements.find(el => el.id === data.targetElementId)
  if (!target) return { x: 0, y: 0 }

  // Get center position of target shape
  const center = getShapeCenter(target)

  // Offset label above shape
  return {
    x: center.x,
    y: center.y - 20  // 20px vertical offset
  }
}

// Get center point of a shape element (alias for compatibility)
function getShapeCenterForElement(element: CanvasElement): { x: number; y: number } {
  return getShapeCenter(element)
}

// Watch for tool changes — dispatch activate/deactivate through registry
watch(() => props.currentTool, (newTool, oldTool) => {
  if (oldTool) toolRegistry.deactivateTool(oldTool as any)
  if (newTool) toolRegistry.activateTool(newTool as any)

  // Pan tool tracking (for pointer handler coordination)
  if (newTool === 'pan') {
    isPanToolActive.value = true
  } else {
    isPanToolActive.value = false
    panStartPointer.value = null
    panStartViewport.value = null
  }
})

// Fillet radius configuration — set via the command line while the fillet tool
// is active (the command engine routes bare numeric input here).
function setFilletRadiusIfActive(n: number): boolean {
  if (props.currentTool === 'fillet') {
    filletRadius.value = n
    return true
  }
  return false
}

defineExpose({
  setFilletRadiusIfActive,
  stageRef,
  exportAsImage,
  loadPDF,
  addImageLayer,
  addPDFLayer,
  updateLayer,
  removeLayer,
  visibleLayers,
  // Cursor tracking for UserPresenceList
  currentUser,
  remoteCursors,
  // Measurement helpers
  getStaleMeasurements,
  // Constraint pipeline
  orthoEnabled,
  toggleOrtho: orthoMode.toggle,
  polarTracking,
  polarTrackingResult,
  gridEnabled: grid.gridEnabled,
  gridSnapEnabled: grid.gridSnapEnabled,
  toggleGrid: grid.toggleGrid,
  toggleGridSnap: grid.toggleGridSnap,
  // Direct distance entry
  applyDirectDistance: toolContext.applyDirectDistance,
  isDrawing,
  // Snap toggle
  snapEnabled: snapping.snapEnabled,
  toggleSnap: snapping.toggleSnap,
})
</script>

<style scoped>
.whiteboard-container {
  touch-action: none;
  /* Prevent browser default gestures like pinch-zoom and scroll */
}
</style>

