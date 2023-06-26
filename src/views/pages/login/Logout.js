import React from 'react'
import { CSpinner } from '@coreui/react'
import { Navigate } from 'react-router-dom'
import { useLoadClientPrincipalQuery } from 'src/store/api/auth'
import { FullScreenLoading } from 'src/components/utilities'
import pleinsudlogo from 'src/assets/images/psgroupe-logo.svg'

const Logout = () => {
  const { data: profile, isFetching, error } = useLoadClientPrincipalQuery()

  const isAuthenticated = !!profile?.clientPrincipal || error

  if (isFetching) {
    return <FullScreenLoading />
  } else if (isAuthenticated) {
    const root = window.location.protocol + '//' + window.location.host
    window.location.href = root + '/.auth/logout?post_logout_redirect_uri=/LogoutRedirect'
    return <CSpinner />
  } else {
    return <Navigate to="/home" />
  }
}

export default Logout
