import React, { Component } from 'react'
import { FormattedMessage } from 'react-intl'
import _get from 'lodash/get'
import { WidgetDataTarget, registerWidgetType }
       from '../../../services/Widget/Widget'
import { isFinalStatus }
       from '../../../services/Task/TaskStatus/TaskStatus'
import { TaskReviewStatus }
      from '../../../services/Task/TaskReview/TaskReviewStatus'
import QuickWidget from '../../QuickWidget/QuickWidget'
import TagDiffVisualization from '../../TagDiffVisualization/TagDiffVisualization'
import TagDiffModal from '../../TagDiffVisualization/TagDiffModal'
import SvgSymbol from '../../SvgSymbol/SvgSymbol'
import BusySpinner from '../../BusySpinner/BusySpinner'
import messages from './Messages'

const descriptor = {
  widgetKey: 'TagDiffWidget',
  label: messages.label,
  targets: [WidgetDataTarget.task],
  minWidth: 4,
  defaultWidth: 8,
  minHeight: 4,
  defaultHeight: 5,
}

export default class TagDiffWidget extends Component {
  state = {
    showDiffModal: false,
  }

  render() {
    return (
      <QuickWidget
        {...this.props}
        className="mr-bg-transparent"
        noMain
        permanent
        widgetTitle={
          <div className="mr-flex">
            <FormattedMessage {...messages.title} />
            <button
              className="mr-text-green-lighter mr-ml-4"
              onClick={() => this.setState({showDiffModal: true})}
            >
              <SvgSymbol
                sym="expand-icon"
                viewBox="0 0 32 32"
                className="mr-transition mr-fill-current mr-w-4 mr-h-4"
              />
            </button>
          </div>
        }
      >
        <TagDiff {...this.props} />

        {this.state.showDiffModal &&
         <TagDiffModal
           {...this.props}
           onClose={() => this.setState({showDiffModal: false})}
         />
        }
      </QuickWidget>
    )
  }
}

export const TagDiff = props => {
  const needsRevised = props.task.reviewStatus === TaskReviewStatus.rejected
  if (props.task.suggestedFix && (!isFinalStatus(props.task.status) || needsRevised)) {
    if (props.loadingOSMData) {
      return (
        <div className="mr-mb-4">
          <BusySpinner />
        </div>
      )
    }

    return (
      <div className="mr-mb-4">
        <TagDiffVisualization
          {...props}
          compact
          suppressToolbar
          onlyChanges
          tagDiff={_get(props, 'tagDiffs[0]')}
        />
      </div>
    )
  }

  return null
}

/**
 * Allow this widget to be treated as a conditional widget, returning true or
 * false as to whether it should be hidden given the current workspace props
 */
TagDiffWidget.hideWidget = function(props) {
  return !_get(props, 'task.suggestedFix', false)
}

registerWidgetType(TagDiffWidget, descriptor)
