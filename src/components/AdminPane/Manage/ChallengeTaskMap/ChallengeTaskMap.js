import React, { Component } from 'react'
import PropTypes from 'prop-types'
import classNames from 'classnames'
import { Marker, Popup, ZoomControl } from 'react-leaflet'
import { FormattedMessage, injectIntl } from 'react-intl'
import MarkerClusterGroup from 'react-leaflet-markercluster'
import { point, featureCollection } from '@turf/helpers'
import bbox from '@turf/bbox'
import bboxPolygon from '@turf/bbox-polygon'
import _get from 'lodash/get'
import _each from 'lodash/each'
import _map from 'lodash/map'
import _fromPairs from 'lodash/fromPairs'
import _isEqual from 'lodash/isEqual'
import L, { latLng } from 'leaflet'
import 'leaflet-vectoricon'
import { layerSourceWithId }
       from '../../../../services/VisibleLayer/LayerSources'
import { messagesByStatus }
       from '../../../../services/Task/TaskStatus/TaskStatus'
import { MAPBOX_LIGHT,
         OPEN_STREET_MAP }
       from '../../../../services/VisibleLayer/LayerSources'
import AsManager from '../../../../interactions/User/AsManager'
import EnhancedMap from '../../../EnhancedMap/EnhancedMap'
import SourcedTileLayer from '../../../EnhancedMap/SourcedTileLayer/SourcedTileLayer'
import LayerToggle from '../../../EnhancedMap/LayerToggle/LayerToggle'
import SearchControl from '../../../EnhancedMap/SearchControl/SearchControl'
import WithVisibleLayer from '../../../HOCs/WithVisibleLayer/WithVisibleLayer'
import WithIntersectingOverlays
       from '../../../HOCs/WithIntersectingOverlays/WithIntersectingOverlays'
import WithStatus from '../../../HOCs/WithStatus/WithStatus'
import BusySpinner from '../../../BusySpinner/BusySpinner'
import messages from './Messages'
import './ChallengeTaskMap.scss'

/**
 * An uncluster option will be offered if no more than this number of tasks
 * will be shown.
 */
const UNCLUSTER_THRESHOLD=1000 // max number of tasks

/**
 * ChallengeTaskMap displays a map of the given challenge tasks for use by
 * challenge owners, with tasks coded by status and priority.
 *
 * @author [Neil Rotstan](https://github.com/nrotstan)
 */
export class ChallengeTaskMap extends Component {
  state = {
    clusterTasks: true,
  }

  currentBounds = null

  shouldComponentUpdate(nextProps, nextState) {
    // We want to be careful about not constantly re-rendering, so we only
    // re-render if something meaningful changes:

    // If our state changed
    if (!_isEqual(nextState, this.state)) {
      return true
    }

    // the base layer has changed, or
    if (_get(nextProps, 'source.id') !== _get(this.props, 'source.id')) {
      return true
    }

    // the available overlays have changed, or
    if (!_isEqual(nextProps.intersectingOverlays, this.props.intersectingOverlays)) {
      return true
    }

    // the visible overlays have changed, or
    if (nextProps.visibleOverlays.length !== this.props.visibleOverlays.length) {
      return true
    }

    // the filtering options have changed, or
    if (!_isEqual(nextProps.filterOptions, this.props.filterOptions)) {
      return true
    }

    // the challenge has changed, or
    if (_get(nextProps, 'challenge.id') !== _get(this.props, 'challenge.id')) {
      return true
    }

    // the challenge id of the clustered tasks change
    if (_get(nextProps, 'taskInfo.challengeId') !==
        _get(this.props, 'taskInfo.challengeId')) {
      return true
    }

    // the loading status of clustered tasks change
    if (_get(nextProps, 'taskInfo.loading') !==
        _get(this.props, 'taskInfo.loading')) {
      return true
    }

    // the clustered tasks themselves change
    if (_get(nextProps, 'taskInfo.tasks.length') !==
        _get(this.props, 'taskInfo.tasks.length')) {
      return true
    }

    // If the map bounds have changed
    if (_get(nextProps, 'currentSearch.challengeOwner.mapBounds.bounds') !==
        this.currentBounds) {
      return true
    }

    return false
  }

  /**
   * Invoked by the cluster-tasks switch to toggle task clustering on and off
   */
  toggleClusterTasks = () => {
    this.setState({clusterTasks: !this.state.clusterTasks})
  }

  /**
   * Signal a change to the current challenge map bounds in response to a
   * change to the map (panning or zooming).
   *
   * @private
   */
  updateBounds = (bounds, zoom) => {
    // If the new bounds are the same as the old, do nothing.
    if (this.currentBounds && this.currentBounds.equals(bounds)) {
      return
    }

    this.currentBounds = bounds
    if (this.props.setChallengeOwnerMapBounds) {
      this.props.setChallengeOwnerMapBounds(this.props.challenge.id,
                                            bounds, zoom)
    }
  }

  clusterIcon = cluster => {
    let colorScheme = null
    switch(_get(this.props, 'source.name')) {
      case MAPBOX_LIGHT:
        colorScheme = 'monochromatic-blue-cluster'
        break;
      case OPEN_STREET_MAP:
        colorScheme = 'monochromatic-brown-cluster'
        break;
      default:
        colorScheme = 'greyscale-cluster'
        break;
    }

    const count = cluster.getChildCount()
    let clusterSizeClass = ''
    if (count < 10) {
      clusterSizeClass = 'few'
    }
    else if (count > 100) {
      clusterSizeClass = 'many'
    }

    return L.divIcon({
      html: `<span class="count">${count}</span>`,
      className: `${colorScheme} ${clusterSizeClass}`,
      iconSize: L.point(40, 40),
    })
  }

  render() {
    if (!this.props.challenge) {
      return null
    }

    let loadingClusteredTasks = false
    const markers = []
    let bounding = null
    const canUncluster =
      _get(this.props, 'taskInfo.tasks.length', 0) <= UNCLUSTER_THRESHOLD

    // Create map markers for the tasks.
    const statusIcons = _fromPairs(_map(this.props.statusColors, (color, status) => [
      status,
      L.vectorIcon({
        className: 'location-marker-icon',
        svgHeight: 20,
        svgWidth: 20,
        type: 'path',
        shape: { // zondicons "location" icon
          d: "M10 20S3 10.87 3 7a7 7 0 1 1 14 0c0 3.87-7 13-7 13zm0-11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"
        },
        style: {
          fill: color,
          stroke: '#666',
          strokeWidth: 0.5,
        },
        iconAnchor: [5, 15], // render tip of SVG near marker location
      })
    ]))

    if (_get(this.props, 'taskInfo.challengeId') ===
        this.props.challenge.id) {
      loadingClusteredTasks = this.props.taskInfo.loading

      if (_get(this.props, 'taskInfo.tasks.length') > 0) {
        _each(this.props.taskInfo.tasks, task => {
          markers.push({
            position: [task.point.lat, task.point.lng],
            options: {
              taskId: task.id,
              name: task.name || task.title,
              status: task.status,
              priority: task.priority,
            },
          })
        })
      }
    }

    // Get the challenge bounding so we know which part of the map to display.
    // Right now API double-nests bounding, but that will likely change.
    bounding = _get(this.props, 'challenge.bounding.bounding') ||
               _get(this.props, 'challenge.bounding')


    // If the challenge doesn't have a bounding polygon, build one from the
    // markers instead. This is extra work and requires waiting for the clustered
    // task data to arrive, so not ideal.
    if (!bounding && markers.length > 0) {
      bounding = bboxPolygon(
        bbox(featureCollection(
          _map(markers, marker => point([marker.position[1], marker.position[0]]))
        ))
      )
    }

    const overlayLayers = _map(this.props.visibleOverlays, (layerId, index) =>
      <SourcedTileLayer key={layerId} source={layerSourceWithId(layerId)} zIndex={index + 2} />
    )


    const renderedMarkers = !_get(this.props, 'challenge.parent') ? [] :
                            _map(markers, markerData => (
      <Marker
        key={markerData.options.taskId}
        {...markerData}
        icon={statusIcons[markerData.options.status]}
      >
        <TaskMarkerPopup {...this.props} marker={markerData} />
      </Marker>
    ))

    // Note: would like to enable chunkedLoading, but enabling runs into
    // https://github.com/Leaflet/Leaflet.markercluster/issues/743 on
    // challenges with a large number of tasks. So disable for now.
    return (
      <div key={this.props.challenge.id}
           className={classNames('challenge-task-map', this.props.className)}>
        {canUncluster &&
         <label className="mr-absolute mr-z-10 mr-pin-b mr-pin-l mr-mb-2 mr-ml-2 mr-shadow mr-rounded-sm mr-bg-black-50 mr-px-2 mr-py-1 mr-text-white mr-text-xs mr-flex mr-items-center">
            <input type="checkbox" className="mr-mr-2"
              checked={this.state.clusterTasks}
              onChange={this.toggleClusterTasks} />
            <FormattedMessage {...messages.clusterTasksLabel } />
          </label>
        }

        <LayerToggle {...this.props} />
        <SearchControl
          {...this.props}
          onResultSelected={bounds => this.props.setChallengeOwnerMapBounds(this.props.challenge.id, bounds)}
        />
        <EnhancedMap center={latLng(0, 45)}
                     zoom={_get(this.props.lastZoom, 3)} minZoom={1} maxZoom={18}
                     setInitialBounds={false}
                     initialBounds = {_get(this.props, 'lastBounds', this.currentBounds)}
                     zoomControl={false} animate={true} worldCopyJump={true}
                     features={this.props.lastBounds ? undefined : bounding}
                     justFitFeatures={false}
                     onBoundsChange={this.updateBounds}>
          <ZoomControl position='topright' />

          <SourcedTileLayer {...this.props} zIndex={1} />
          {overlayLayers}
          {markers.length > 0 &&
           <MarkerClusterGroup
             key={Date.now()}
             disableClusteringAtZoom={(canUncluster && !this.state.clusterTasks) ? 1 : 19}
             iconCreateFunction={this.props.monochromaticClusters ? this.clusterIcon : undefined}
           >
             {renderedMarkers}
           </MarkerClusterGroup>
          }
        </EnhancedMap>

        {loadingClusteredTasks && <BusySpinner mapMode />}
      </div>
    )
  }
}

const TaskMarkerPopup = props => {
  const manager = AsManager(props.user)
  const taskBaseRoute =
    `/admin/project/${props.challenge.parent.id}` +
    `/challenge/${props.challenge.id}/task/${props.marker.options.taskId}`

  return (
    <Popup>
      <div className="marker-popup-content">
        <div>
          {
            props.intl.formatMessage(messages.nameLabel)
          } {
            props.marker.options.name
          }
        </div>
        <div>
          {
            props.intl.formatMessage(messages.statusLabel)
          } {
            props.intl.formatMessage(messagesByStatus[props.marker.options.status])
          }
        </div>

        <div className="marker-popup-content__links">
          <div>
            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
            <a onClick={() => props.history.push(`${taskBaseRoute}/inspect`)}>
              {props.intl.formatMessage(messages.inspectTaskLabel)}
            </a>
          </div>

          {manager.canWriteProject(props.challenge.parent) &&
            <div>
              {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
              <a onClick={() => props.history.push(`${taskBaseRoute}/edit`)}>
                {props.intl.formatMessage(messages.editTaskLabel)}
              </a>
            </div>
          }
        </div>
      </div>
    </Popup>
  )
}

ChallengeTaskMap.propTypes = {
  /** The current challenge being shown */
  challenge: PropTypes.object.isRequired,
  /** The tasks to map */
  taskInfo: PropTypes.shape({
    challengeId: PropTypes.number,
    loading: PropTypes.bool,
    tasks: PropTypes.array,
  }),
  /** Color codings for the various task statuses */
  statusColors: PropTypes.object.isRequired,
  /** Options for filtering displayed tasks */
  filterOptions: PropTypes.object,
  /** Invoked when the user moves or zooms the map */
  setChallengeOwnerMapBounds: PropTypes.func,
  /** Optional default map layer to display */
  defaultLayer: PropTypes.object,
  /** Set to true to render monochromatic cluster icons */
  monochromaticClusters: PropTypes.bool,
}

ChallengeTaskMap.defaultProps = {
  filterOptions: {},
  greyscaleClusters: false,
}

export default WithStatus(
  WithVisibleLayer(
    WithIntersectingOverlays(
      injectIntl(ChallengeTaskMap),
      'challengeOwner'
    )
  )
)
